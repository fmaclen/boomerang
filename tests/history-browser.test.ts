import { expect, test } from 'bun:test';
import type { Result } from '../src/lib/engine/types';

// The History client on a box that leaves runs to each browser.
const kept = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v) },
  fetch: async () => Response.json({ history: 'browser' }),
});
const { clearRuns, getRun, listRuns, saveRun } = await import('../src/lib/engine/history');

test('a cleared run is gone from this page too, not only from storage', async () => {
  const transfer = { mbps: 100, bytes: 1e6, seconds: 4, samples: [] };
  const r: Result = { id: 'mine', startedAt: Date.UTC(2026, 0, 1), mode: 'adaptive', download: transfer, upload: transfer, latency: { idleMs: 1, jitterMs: 0 } };
  expect(await saveRun(r)).toBe(true);
  expect((await getRun('mine'))?.id).toBe('mine');
  expect(await clearRuns()).toBe(true);
  expect(await getRun('mine')).toBeNull();
  expect((await listRuns(0))!.runs).toEqual([]);
});
