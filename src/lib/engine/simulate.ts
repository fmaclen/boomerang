import { HISTORY_KEY } from './history';
import type { Network, Streams } from './measure';
import type { Device, Result, Sample, Transfer } from './types';

// The landing page's demo (`vite build --mode demo`) has no box to measure.
// Its runs read a simulated link instead: an ordinary wired gigabit network
// at home, a few milliseconds away, that delivers a little over 900 Mbps each
// way and wobbles the way a real run does. Only the readings are made up;
// the run itself is the engine's own (see measure.ts), and nothing is sent
// anywhere. seedHistory fills the demo's History with a few past runs.

/** Bytes are delivered this often, as a real stream's chunks would arrive. */
const CHUNK_MS = 20;

/**
 * One direction's rate over time, in Mbps: a quick climb as the streams open,
 * then a level with a slow drift, chunk-to-chunk noise, and now and then a
 * short dip that the rolling second shows as a wobble.
 */
class Flow {
  private t = 0;
  private drift = 0;
  private dipUntil = -1;
  private nextDrift = 0;

  constructor(private readonly target: number) {}

  /** The rate over the next dt seconds. */
  step(dt: number): number {
    this.t += dt;
    if (this.t >= this.nextDrift) {
      this.drift = clamp(this.drift * 0.85 + (Math.random() - 0.5) * 0.02, -0.03, 0.03);
      this.nextDrift = this.t + 0.2;
    }
    if (this.t > 1 && this.t > this.dipUntil + 1 && Math.random() < dt * 0.12) this.dipUntil = this.t + 0.2 + Math.random() * 0.25;
    const ramp = 1 - Math.exp(-this.t / 0.28);
    const dip = this.t < this.dipUntil ? 0.72 : 1;
    const noise = 1 + (Math.random() - 0.5) * 0.12;
    return this.target * ramp * (1 + this.drift) * dip * noise;
  }
}

/** A gigabit link's rates and latencies for one run. */
function link() {
  return {
    downloadMbps: between(918, 946),
    uploadMbps: between(884, 928),
    idleMs: between(2.2, 4.2),
    /** What a loaded link adds to the round trip: the buffers filling. */
    downloadExtraMs: between(4, 9),
    uploadExtraMs: between(2, 6),
  };
}

export function simulatedNetwork(): Network {
  const l = link();
  let loaded: 'download' | 'upload' | null = null;

  const streams =
    (kind: 'download' | 'upload', target: number): Streams =>
    (onBytes, _fail, signal) => {
      const flow = new Flow(target);
      let last = performance.now();
      loaded = kind;
      const timer = setInterval(() => {
        const now = performance.now();
        const dt = (now - last) / 1000;
        last = now;
        onBytes(Math.round((flow.step(dt) * 1e6 * dt) / 8));
      }, CHUNK_MS);
      signal.addEventListener(
        'abort',
        () => {
          clearInterval(timer);
          loaded = null;
        },
        { once: true },
      );
    };

  return {
    ping(signal) {
      const extra = loaded === 'download' ? l.downloadExtraMs : loaded === 'upload' ? l.uploadExtraMs : 0;
      const ms = roundTrip(l.idleMs, extra);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(ms), ms);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new DOMException('Run aborted', 'AbortError'));
          },
          { once: true },
        );
      });
    },
    download: streams('download', l.downloadMbps),
    upload: streams('upload', l.uploadMbps),
  };
}

/** A round trip: the base, what load adds with most of its own spread, a little noise, and a rare slow one. */
function roundTrip(idleMs: number, extraMs: number): number {
  const spread = extraMs ? extraMs * between(0.6, 1.5) : 0;
  const slow = Math.random() < 0.08 ? between(1, 3) : 0;
  return idleMs + spread + Math.abs(gauss()) * 0.5 + slow;
}

// ---------------------------------------------------------------------------
// The demo's History

const DAY = 86_400_000;

/** Past runs: when, on what, and how much of the gigabit that device's connection reached. */
const PAST: { daysAgo: number; device: Device; reach: number; mode?: 'fixed' }[] = [
  { daysAgo: 0.2, device: { os: 'iPhone', form: 'Mobile', browser: 'Safari' }, reach: 0.62 },
  { daysAgo: 1.1, device: { os: 'macOS', form: 'Desktop', browser: 'Safari' }, reach: 1 },
  { daysAgo: 3.4, device: { os: 'Windows', form: 'Desktop', browser: 'Chrome' }, reach: 0.99, mode: 'fixed' },
  { daysAgo: 6.8, device: { os: 'Android', form: 'Mobile', browser: 'Chrome' }, reach: 0.48 },
  { daysAgo: 9.5, device: { os: 'macOS', form: 'Desktop', browser: 'Firefox' }, reach: 0.97 },
];

/**
 * Fills the demo's History with a few past runs the first time it is opened
 * in a browser, so the list has something to show before the visitor's own
 * run lands in it. Once seeded (or cleared), it is left alone.
 */
export function seedHistory(): void {
  try {
    if (localStorage.getItem(HISTORY_KEY) !== null) return;
    const now = Date.now();
    const runs = PAST.map((p) => pastRun(now - p.daysAgo * DAY, p.device, p.reach, p.mode ?? 'adaptive'));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(runs));
  } catch {
    // Storage blocked: the demo runs with an empty History.
  }
}

function pastRun(startedAt: number, device: Device, reach: number, mode: 'adaptive' | 'fixed'): Result {
  const l = link();
  const seconds = () => (mode === 'fixed' ? 30 : between(3.2, 5));
  const wifi = reach < 0.9;
  const idleMs = l.idleMs + (wifi ? between(2, 5) : 0);
  const pings = Array.from({ length: 10 }, () => roundTrip(idleMs, 0));
  return {
    id: `demo-${startedAt.toString(36)}`,
    startedAt,
    mode,
    download: pastTransfer(l.downloadMbps * reach, seconds()),
    upload: pastTransfer(l.uploadMbps * reach * (wifi ? 0.85 : 1), seconds()),
    latency: {
      idleMs: median(pings),
      jitterMs: pings.slice(1).reduce((sum, p, i) => sum + Math.abs(p - pings[i]), 0) / (pings.length - 1),
      downloadMs: roundTrip(idleMs, l.downloadExtraMs * (wifi ? 2 : 1)),
      uploadMs: roundTrip(idleMs, l.uploadExtraMs * (wifi ? 2 : 1)),
    },
    device,
  };
}

/** A finished direction as the engine would have kept it: the rolling one-second rate ten times a second, and the rate after the first second. */
function pastTransfer(target: number, seconds: number): Transfer {
  const flow = new Flow(target);
  const dt = CHUNK_MS / 1000;
  const bytesAt: number[] = [0];
  let bytes = 0;
  for (let t = dt; t <= seconds + 1e-9; t += dt) {
    bytes += (flow.step(dt) * 1e6 * dt) / 8;
    bytesAt.push(bytes);
  }
  const at = (t: number) => bytesAt[Math.min(bytesAt.length - 1, Math.round(t / dt))];
  const samples: Sample[] = [];
  for (let t = 0.1; t <= seconds + 1e-9; t += 0.1) {
    const from = Math.max(0, t - 1);
    samples.push({ t: Math.floor(t * 100) / 100, mbps: +(((at(t) - at(from)) * 8) / 1e6 / (t - from)).toPrecision(4) });
  }
  return { mbps: ((bytes - at(1)) * 8) / 1e6 / (seconds - 1), bytes: Math.round(bytes), seconds, samples };
}

function between(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** A standard normal draw (Box-Muller). */
function gauss(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
