import type { Mode, Progress, Result, Sample, Transfer } from './types';

// The measurement itself: idle latency, then download, then upload. Storage
// is history.ts; index.ts runs the two together. Everything that touches the
// wire is the Network below: the box's endpoints by default, a simulated
// link in the public demo (see simulate.ts).

/** Five transfer streams, leaving the sixth HTTP/1.1 connection to the page. */
const STREAMS = 5;
const UPLOAD_BLOB_BYTES = 8 * 1024 * 1024;
const IDLE_PROBES = 10;
/**
 * Latency takes ten probes or two seconds, whichever comes first; a probe
 * still out at two seconds is cut off. Until one has answered, the first gets
 * FIRST_PROBE_MS, and a box that has not answered by then fails the run.
 */
const IDLE_PROBE_BUDGET_MS = 2000;
const FIRST_PROBE_MS = 4000;
const TICK_MS = 100;
const ADAPTIVE_FLOOR_S = 3;
const ADAPTIVE_CAP_S = 5;
const ADAPTIVE_STABLE_RATIO = 0.05;
const FIXED_S = 30;

/** The shortest each direction runs: an adaptive run's floor, a fixed run's length. */
export const MIN_PHASE_SECONDS: Record<Mode, number> = { adaptive: ADAPTIVE_FLOOR_S, fixed: FIXED_S };

type OnBytes = (count: number) => void;
type Fail = (error: unknown) => void;
/** Starts a direction's transfer: reports bytes as they move, calls fail if it breaks, and stops when signal aborts. */
export type Streams = (onBytes: OnBytes, fail: Fail, signal: AbortSignal) => void;

/** The readings a run takes: a round trip's time in ms, and the bytes each direction moves. */
export interface Network {
  ping(signal: AbortSignal): Promise<number>;
  download: Streams;
  upload: Streams;
}

/** Awaited before each transfer starts, so the page can give the phase before it a beat on screen. */
export type Beat = (phase: 'download' | 'upload') => Promise<void>;

export async function measure(
  mode: Mode,
  notify: (progress: Progress) => void,
  signal: AbortSignal,
  before?: Beat,
  network: Network = box,
): Promise<Result> {
  const startedAt = Date.now();
  const progress: Progress = { phase: 'latency', mbps: 0, bytes: 0 };
  const emit = (patch: Partial<Progress> = {}) => notify(Object.assign(progress, patch));

  emit();
  throwIfAborted(signal);
  const { idleMs, jitterMs } = await idleLatency(network, signal, (pings) => emit({ pings }));
  emit({ idleMs, jitterMs });

  await hold(before?.('download'), signal);
  emit({ phase: 'download' });
  const download = await transferPhase('download', mode, network.download, signal, (mbps, bytes) => emit({ mbps, bytes }));
  emit({ download, mbps: 0 });

  await hold(before?.('upload'), signal);
  emit({ phase: 'upload' });
  const upload = await transferPhase('upload', mode, network.upload, signal, (mbps, bytes) => emit({ mbps, bytes: download.bytes + bytes }));
  emit({ upload, mbps: 0 });

  return { id: newId(), startedAt, mode, download, upload, latency: { idleMs, jitterMs } };
}

/** Median of the probes is the latency, the mean step between them the jitter. */
async function idleLatency(
  network: Network,
  signal: AbortSignal,
  onProbe: (times: number[]) => void,
): Promise<{ idleMs: number; jitterMs: number }> {
  const times: number[] = [];
  const start = performance.now();
  while (times.length < IDLE_PROBES) {
    const left = (times.length ? IDLE_PROBE_BUDGET_MS : FIRST_PROBE_MS) - (performance.now() - start);
    if (left <= 0) break;
    try {
      times.push(await network.ping(AbortSignal.any([signal, AbortSignal.timeout(left)])));
    } catch (error) {
      if (signal.aborted || !(error instanceof DOMException && error.name === 'TimeoutError')) throw error;
      break;
    }
    onProbe([...times]);
  }
  if (!times.length) throw new Error('the box did not answer ping');
  return { idleMs: median(times), jitterMs: meanAbsoluteStep(times) };
}

/** The box that served the page: its /ping, /downloading and /upload. */
const box: Network = { ping, download: downloadStreams, upload: uploadStreams };

async function ping(signal: AbortSignal): Promise<number> {
  const started = performance.now();
  const response = await fetch(endpoint('/ping'), { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`ping answered ${response.status}`);
  return performance.now() - started;
}

type OnTick = (mbps: number, bytes: number) => void;

/**
 * Runs one direction: starts the streams, then ticks ten times a second to
 * update the rolling rate, keep it as a sample, close a one-second window
 * every second, and decide when the phase is over.
 */
function transferPhase(
  kind: 'download' | 'upload',
  mode: Mode,
  streams: Streams,
  signal: AbortSignal,
  onTick: OnTick,
): Promise<Transfer> {
  return new Promise((resolve, reject) => {
    const phase = new AbortController();
    const abortPhase = () => phase.abort();
    signal.addEventListener('abort', abortPhase, { once: true });

    const start = performance.now();
    const samples: Sample[] = [];
    // The rate over each whole second, which decides when an adaptive phase is over.
    const windows: Sample[] = [];
    const recent: { t: number; bytes: number }[] = [];
    let bytes = 0;
    let lastWindowT = 0;
    let lastWindowBytes = 0;
    // Where the first second ended; the reported rate counts from here.
    let afterFirstSecond: { t: number; bytes: number } | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    const finish = (error?: unknown) => {
      clearInterval(timer);
      signal.removeEventListener('abort', abortPhase);
      phase.abort();
      if (error !== undefined) return reject(error);
      if (signal.aborted) return reject(abortError());
      const seconds = (performance.now() - start) / 1000;
      const from = afterFirstSecond ?? { t: 0, bytes: 0 };
      const mbps = seconds > from.t ? megabits(bytes - from.bytes) / (seconds - from.t) : 0;
      resolve({ mbps, bytes, seconds, samples });
    };

    if (signal.aborted) return finish();
    streams(
      (count) => {
        bytes += count;
      },
      (error) => finish(error ?? new Error(`${kind} failed`)),
      phase.signal,
    );

    timer = setInterval(() => {
      if (signal.aborted) return finish();
      const elapsed = (performance.now() - start) / 1000;

      recent.push({ t: elapsed, bytes });
      while (recent.length > 1 && elapsed - recent[1].t >= 1) recent.shift();
      const oldest = recent[0];
      const rolling = elapsed > oldest.t ? megabits(bytes - oldest.bytes) / (elapsed - oldest.t) : 0;

      if (!afterFirstSecond && elapsed >= 1) afterFirstSecond = { t: elapsed, bytes };
      if (elapsed >= windows.length + 1) {
        windows.push({ t: windows.length + 1, mbps: megabits(bytes - lastWindowBytes) / (elapsed - lastWindowT) });
        lastWindowT = elapsed;
        lastWindowBytes = bytes;
      }
      // Each tick's reading of the meter, as the live chart draws it, to four
      // significant digits at the hundredth of a second it was read in.
      samples.push({ t: Math.floor(elapsed * 100) / 100, mbps: +rolling.toPrecision(4) });

      onTick(rolling, bytes);
      if (phaseOver(mode, elapsed, windows)) finish();
    }, TICK_MS);
  });
}

/** Fixed runs the full length. Adaptive stops at the cap, or once past the floor when the last two one-second windows agree. */
function phaseOver(mode: Mode, elapsed: number, windows: Sample[]): boolean {
  if (mode === 'fixed') return elapsed >= FIXED_S;
  if (elapsed >= ADAPTIVE_CAP_S) return true;
  if (elapsed < ADAPTIVE_FLOOR_S || windows.length < 2) return false;
  const a = windows[windows.length - 2].mbps;
  const b = windows[windows.length - 1].mbps;
  return Math.abs(a - b) <= ADAPTIVE_STABLE_RATIO * Math.max(a, b);
}

/**
 * Opens the streams one after another, STAGGER_MS apart. Safari sets up a
 * worker's requests on the page's thread, and five opened at once held up a
 * frame of the scene. The reported rate counts from the end of the first
 * second, long after the last has opened.
 */
const STAGGER_MS = 30;
function staggered(open: () => void, signal: AbortSignal): void {
  for (let i = 0; i < STREAMS; i++) setTimeout(() => signal.aborted || open(), i * STAGGER_MS);
}

function downloadStreams(onBytes: OnBytes, fail: Fail, signal: AbortSignal): void {
  staggered(
    () =>
      downloadStream(onBytes, signal).catch((error) => {
        if (!signal.aborted) fail(error);
      }),
    signal,
  );
}

/** Fetches the file over and over, counting bytes as chunks arrive, until aborted. */
async function downloadStream(onBytes: OnBytes, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    const response = await fetch(endpoint('/downloading'), { cache: 'no-store', signal });
    if (!response.ok || !response.body) throw new Error(`download answered ${response.status}`);
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onBytes(value.byteLength);
    }
  }
}

function uploadStreams(onBytes: OnBytes, fail: Fail, signal: AbortSignal): void {
  const blob = randomBlob(UPLOAD_BLOB_BYTES);
  staggered(() => uploadStream(blob, onBytes, fail, signal), signal);
}

/**
 * Posts the blob over and over, counting bytes from upload progress, until
 * aborted. A post that completes or drops mid-way is followed by another; a
 * post the box refuses, or one that never got a byte through, ends the run.
 */
function uploadStream(blob: Blob, onBytes: OnBytes, fail: Fail, signal: AbortSignal): void {
  const post = () => {
    if (signal.aborted) return;
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    let sent = 0;
    xhr.open('POST', endpoint('/upload'));
    xhr.upload.onprogress = (event) => {
      onBytes(event.loaded - sent);
      sent = event.loaded;
    };
    xhr.onloadend = () => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) return;
      if (xhr.status >= 300) return fail(new Error(`upload answered ${xhr.status}`));
      if (xhr.status === 0 && sent === 0) return fail(new Error('upload failed'));
      post();
    };
    signal.addEventListener('abort', abort, { once: true });
    xhr.send(blob);
  };
  post();
}

/**
 * size bytes of noise: one random 64 KiB block, the most getRandomValues
 * fills at once, repeated. Nothing compresses an upload on its way, so the
 * repeat costs the measurement nothing, and the blob is made of references
 * to the one block. Safari registers a worker's blobs on the page's thread,
 * copying their bytes there: 64 KiB is nothing, 8 MiB held a frame up.
 */
function randomBlob(size: number): Blob {
  const block = new Blob([crypto.getRandomValues(new Uint8Array(65536))]);
  // Typed, so no server takes the post for a form submission and checks its origin.
  return new Blob(
    Array.from({ length: Math.ceil(size / 65536) }, () => block),
    { type: 'application/octet-stream' },
  );
}

/** randomUUID needs a secure context, which plain http over the tailnet is not. */
function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function megabits(bytes: number): number {
  return (bytes * 8) / 1e6;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function meanAbsoluteStep(values: number[]): number {
  if (values.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < values.length; i++) total += Math.abs(values[i] - values[i - 1]);
  return total / (values.length - 1);
}

/**
 * An endpoint on the box that served the page, made unique so no cache
 * answers it. Spelled out in full, since the worker this runs in lives at a
 * blob: address that a bare path cannot resolve against.
 */
function endpoint(path: string): string {
  return `${location.origin}${path}?${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** Waits for the page's beat, if it asked for one; an abort ends the wait. */
async function hold(beat: Promise<void> | undefined, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (!beat) return;
  await new Promise<void>((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    beat.then(
      () => {
        signal.removeEventListener('abort', abort);
        resolve();
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
  throwIfAborted(signal);
}

function abortError(): Error {
  return new DOMException('Run aborted', 'AbortError');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}
