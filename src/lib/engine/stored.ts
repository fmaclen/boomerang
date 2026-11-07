import type { Device, Latency, Result, Sample, Summary, Transfer } from './types';

// Every saved run passes through here on its way in and out: a post to the
// box, the box's own list, and this browser's storage. Only these fields, of
// these types and within these bounds, get through, so a damaged or hostile
// record can neither reach the database nor break History or a replay.

/** A fixed run samples ten times a second for thirty seconds; this is ample headroom over that. */
const MAX_SAMPLES = 2000;
/** The longest a phase can have run: a fixed run's thirty seconds, with room. */
const MAX_SECONDS = 120;
const MAX_MBPS = 1e7;
const MAX_BYTES = 1e14;
const MAX_MS = 6e4;
const MAX_TEXT = 64;
/** Runs are dated between 2020 and 2100. */
const EARLIEST = Date.UTC(2020, 0, 1);
const LATEST = Date.UTC(2100, 0, 1);

/** Copies a run's fields out of an untrusted value, or returns null when any is missing, malformed or out of bounds. */
export function parseResult(value: unknown): Result | null {
  const run = parseSummary(value);
  if (!run) return null;
  const input = value as { download: { samples?: unknown }; upload: { samples?: unknown } };
  const download = samplesOf(input.download.samples, run.download.seconds);
  const upload = samplesOf(input.upload.samples, run.upload.seconds);
  if (!download || !upload) return null;
  return { ...run, download: { ...run.download, samples: download }, upload: { ...run.upload, samples: upload } };
}

/** The same check without the samples, for History's list. */
export function parseSummary(value: unknown): Summary | null {
  const input = object(value);
  if (!input) return null;
  const { id, startedAt, mode } = input;
  if (!text(id) || id === '' || !within(startedAt, EARLIEST, LATEST)) return null;
  if (mode !== 'adaptive' && mode !== 'fixed') return null;
  const download = transfer(input.download);
  const upload = transfer(input.upload);
  const latency = latencyOf(input.latency);
  if (!download || !upload || !latency) return null;
  const run: Summary = { id, startedAt, mode, download, upload, latency };
  if (input.device !== undefined) {
    const device = deviceOf(input.device);
    if (!device) return null;
    run.device = device;
  }
  return run;
}

/** A run as History lists it. */
export const summaryOf = ({ download, upload, ...run }: Result | Summary): Summary => ({
  ...run,
  download: { mbps: download.mbps, bytes: download.bytes, seconds: download.seconds },
  upload: { mbps: upload.mbps, bytes: upload.bytes, seconds: upload.seconds },
});

function transfer(value: unknown): Omit<Transfer, 'samples'> | null {
  const input = object(value);
  if (!input) return null;
  const { mbps, bytes, seconds } = input;
  if (!within(mbps, 0, MAX_MBPS) || !within(bytes, 0, MAX_BYTES) || !within(seconds, 0, MAX_SECONDS)) return null;
  return { mbps, bytes, seconds };
}

/** A phase's samples, in order of time and inside the phase. */
function samplesOf(value: unknown, seconds: number): Sample[] | null {
  if (!Array.isArray(value) || value.length > MAX_SAMPLES) return null;
  const out: Sample[] = [];
  for (const s of value) {
    const sample = object(s);
    const last = out.length ? out[out.length - 1].t : 0;
    if (!sample || !within(sample.t, last, seconds + 1) || !within(sample.mbps, 0, MAX_MBPS)) return null;
    out.push({ t: sample.t, mbps: sample.mbps });
  }
  return out;
}

function latencyOf(value: unknown): Latency | null {
  const input = object(value);
  if (!input) return null;
  const { idleMs, jitterMs } = input;
  if (!within(idleMs, 0, MAX_MS) || !within(jitterMs, 0, MAX_MS)) return null;
  return { idleMs, jitterMs };
}

function deviceOf(value: unknown): Device | null {
  const input = object(value);
  if (!input) return null;
  const { os, form, browser } = input;
  if (!text(os) || !text(browser)) return null;
  if (form !== 'Desktop' && form !== 'Mobile' && form !== 'Tablet') return null;
  return { os, form, browser };
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function within(value: unknown, lo: number, hi: number): value is number {
  return typeof value === 'number' && value >= lo && value <= hi;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT;
}
