import { expect, test } from 'bun:test';
import { parseResult, parseSummary } from '../src/lib/engine/stored';
import type { Result } from '../src/lib/engine/types';

const samples = [
  { t: 0.1, mbps: 90 },
  { t: 0.2, mbps: 95 },
];
const good: Result = {
  id: 'a',
  startedAt: Date.UTC(2026, 10, 7),
  mode: 'adaptive',
  download: { mbps: 95, bytes: 5e7, seconds: 4.2, samples },
  upload: { mbps: 20, bytes: 1e7, seconds: 4.1, samples },
  latency: { idleMs: 3.1, jitterMs: 0.4 },
  device: { os: 'macOS', form: 'Desktop', browser: 'Safari' },
};
const edit = (patch: (r: Result) => void) => {
  const r = structuredClone(good);
  patch(r);
  return r;
};

test('a whole run is kept as it was, and a list row is the run without its samples', () => {
  expect(parseResult(good)).toEqual(good);
  expect(parseSummary(good)?.download).toEqual({ mbps: 95, bytes: 5e7, seconds: 4.2 });
});

test('a run saved with latency under load still reads, without it', () => {
  const old = { ...good, latency: { ...good.latency, downloadMs: 9, uploadMs: 7 } };
  expect(parseResult(old)?.latency).toEqual(good.latency);
});

test('records that would break History or a replay are refused', () => {
  const broken = [
    edit((r) => (r.startedAt = 1e100)),
    edit((r) => (r.startedAt = Number.NaN)),
    edit((r) => (r.download.seconds = 1e9)),
    edit((r) => (r.upload.mbps = -5)),
    edit((r) => (r.download.bytes = Infinity)),
    edit((r) => (r.latency.jitterMs = -1)),
    edit(
      (r) =>
        (r.download.samples = [
          { t: 0.2, mbps: 1 },
          { t: 0.1, mbps: 1 },
        ]),
    ),
    edit((r) => (r.upload.samples = [{ t: 50, mbps: 1 }])),
    {},
  ];
  for (const r of broken) expect(parseResult(r)).toBeNull();
});
