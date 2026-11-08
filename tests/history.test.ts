import { expect, test } from 'bun:test';
import type { Result } from '../src/lib/engine/types';

// The History client against a stubbed box. Each file gets its own module,
// so this one is a box that keeps runs, and history-browser.test.ts one that
// leaves them to the browser.
const stored = Array.from({ length: 25 }, (_, i) => run(`server-${i}`, 1000 - i));
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input), 'http://box');
  if (init?.method === 'POST') return new Response(null, { status: 500 });
  const from = Number(url.searchParams.get('from'));
  return Response.json({ runs: stored.slice(from, from + 10), more: from + 10 < stored.length });
}) as typeof fetch;

const { listRuns, saveRun } = await import('../src/lib/engine/history');

function run(id: string, minutes: number): Result {
  const transfer = { mbps: 100, bytes: 1e6, seconds: 4, samples: [] };
  return { id, startedAt: Date.UTC(2026, 0, 1) + minutes * 60_000, mode: 'adaptive', download: transfer, upload: transfer, latency: { idleMs: 1, jitterMs: 0 } };
}

test("a run the box didn't take is listed first, and Load more still starts where the box's own page ended", async () => {
  expect(await saveRun(run('unsaved', 2000))).toBe(false);
  const first = (await listRuns(0))!;
  expect(first.runs.map((r) => r.id).slice(0, 2)).toEqual(['unsaved', 'server-0']);
  expect(first.runs).toHaveLength(11);
  const next = (await listRuns(first.next))!;
  expect(next.runs[0].id).toBe('server-10');
});
