import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as download from '../src/routes/downloading/+server';
import * as ping from '../src/routes/ping/+server';
import * as one from '../src/routes/runs/[id]/+server';
import * as runs from '../src/routes/runs/+server';
import * as upload from '../src/routes/upload/+server';
import type { Result } from '../src/lib/engine/types';

// The box's own routes, called as SvelteKit calls them, on a store of their own.
const dir = mkdtempSync(join(tmpdir(), 'boomerang-'));
process.env.RUNS_DB = join(dir, 'runs.sqlite');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const run = (i: number): Result => ({
  id: `run-${i}`,
  startedAt: Date.UTC(2026, 0, 1) + i * 60_000,
  mode: 'fixed',
  download: { mbps: 900, bytes: 3e9, seconds: 30, samples: Array.from({ length: 300 }, (_, k) => ({ t: (k + 1) / 10, mbps: 900 })) },
  upload: { mbps: 800, bytes: 3e9, seconds: 30, samples: [{ t: 0.1, mbps: 800 }] },
  latency: { idleMs: 1, jitterMs: 0.1 },
});
const post = (body: unknown) => runs.POST({ request: new Request('http://box/runs', { method: 'POST', body: JSON.stringify(body) }) });
const list = async (from: number) => (await runs.GET({ url: new URL(`http://box/runs?from=${from}`) })).json();

test('the store takes whole runs, once each, and refuses anything else', async () => {
  expect((await post(run(0))).status).toBe(201);
  expect((await post(run(0))).status).toBe(201);
  expect((await post({ ...run(1), startedAt: 1e100 })).status).toBe(400);
  expect((await post('x'.repeat(300_000))).status).toBe(413);
  expect((await list(0)).runs).toHaveLength(1);
});

test('History is sent a page of ten at a time, newest first, without the samples; a reopened run gets them all', async () => {
  for (let i = 1; i < 25; i++) await post(run(i));
  const first = await list(0);
  expect(first.runs.map((r: Result) => r.id)).toEqual(Array.from({ length: 10 }, (_, k) => `run-${24 - k}`));
  expect(first.more).toBe(true);
  expect(first.runs[0].download).toEqual({ mbps: 900, bytes: 3e9, seconds: 30 });
  expect((await list(20)).runs).toHaveLength(5);
  expect((await list(20)).more).toBe(false);
  const whole = await (await one.GET({ params: { id: 'run-3' } })).json();
  expect(whole.download.samples).toHaveLength(300);
  expect((await one.GET({ params: { id: 'nope' } })).status).toBe(404);
});

test('Clear empties the store', async () => {
  expect((await runs.DELETE()).status).toBe(204);
  expect((await list(0)).runs).toEqual([]);
});

test('a box that keeps runs in browsers says so, and stores nothing', async () => {
  process.env.HISTORY = 'browser';
  try {
    expect(await list(0)).toEqual({ history: 'browser' });
    expect((await post(run(9))).status).toBe(404);
  } finally {
    delete process.env.HISTORY;
  }
});

test('ping answers at once, and nothing is cached', () => {
  const res = ping.GET();
  expect(res.status).toBe(204);
  expect(res.headers.get('cache-control')).toBe('no-store');
});

test('the download is 100 MiB of uncached, uncompressed noise', async () => {
  const res = download.GET();
  expect(res.headers.get('content-length')).toBe(String(100 * 1024 * 1024));
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('content-encoding')).toBeNull();
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  expect(new Set(value!.subarray(0, 4096)).size).toBeGreaterThan(200);
  await reader.cancel();
});

test('an upload is answered only once its last byte is in', async () => {
  let read = 0;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(c) {
      await Bun.sleep(5);
      read += 65536;
      if (++pulls === 20) c.close();
      else c.enqueue(new Uint8Array(65536));
    },
  });
  const res = await upload.POST({ request: new Request('http://box/upload', { method: 'POST', body, duplex: 'half' } as RequestInit) });
  expect(res.status).toBe(200);
  expect(pulls).toBe(20);
  expect(read).toBe(20 * 65536);
});
