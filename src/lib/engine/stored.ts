import type { Device, Latency, Result, Sample, Transfer } from './types.ts';

/**
 * The box keeps each finished run whole, as History needs it: the numbers,
 * the samples its charts redraw from, and the device it ran on. The client
 * posts a Result and the store re-parses it with `parseResult`, so only these
 * fields, of these types, can ever reach the database.
 */

/** A fixed run samples ten times a second for thirty seconds; this is ample headroom over that. */
const MAX_SAMPLES = 2000;
const MAX_TEXT = 64;

/** Copies a run's fields out of an untrusted body, or returns null when any is missing or malformed. */
export function parseResult(body: unknown): Result | null {
  const input = object(body);
  if (!input) return null;
  const { id, startedAt, mode } = input;
  if (!text(id) || id === '' || !finite(startedAt)) return null;
  if (mode !== 'adaptive' && mode !== 'fixed') return null;
  const download = transfer(input.download);
  const upload = transfer(input.upload);
  const latency = latencyOf(input.latency);
  if (!download || !upload || !latency) return null;
  const result: Result = { id, startedAt, mode, download, upload, latency };
  if (input.device !== undefined) {
    const device = deviceOf(input.device);
    if (!device) return null;
    result.device = device;
  }
  return result;
}

function transfer(value: unknown): Transfer | null {
  const input = object(value);
  if (!input) return null;
  const { mbps, bytes, seconds, samples } = input;
  if (!finite(mbps) || !finite(bytes) || !finite(seconds)) return null;
  if (!Array.isArray(samples) || samples.length > MAX_SAMPLES) return null;
  const out: Sample[] = [];
  for (const s of samples) {
    const sample = object(s);
    if (!sample || !finite(sample.t) || !finite(sample.mbps)) return null;
    out.push({ t: sample.t, mbps: sample.mbps });
  }
  return { mbps, bytes, seconds, samples: out };
}

function latencyOf(value: unknown): Latency | null {
  const input = object(value);
  if (!input) return null;
  const { idleMs, jitterMs, downloadMs, uploadMs } = input;
  if (!finite(idleMs) || !finite(jitterMs) || !finite(downloadMs) || !finite(uploadMs)) return null;
  return { idleMs, jitterMs, downloadMs, uploadMs };
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

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT;
}
