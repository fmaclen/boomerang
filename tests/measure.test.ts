import { expect, test } from 'bun:test';
import { measure, type Network } from '../src/lib/engine/measure';

// A link whose box answers the first few pings and then none.
function network(answers: number): Network {
  let n = 0;
  return {
    ping: (signal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        if (n++ < answers) setTimeout(() => resolve(2), 2);
      }),
    download: () => {},
    upload: () => {},
  };
}

test("a ping still out when latency's two seconds are up is cut off, and the run goes on", async () => {
  const run = new AbortController();
  const started = performance.now();
  const idle = new Promise<number>((resolve) =>
    measure('adaptive', (p) => p.idleMs !== undefined && resolve(p.idleMs), run.signal, undefined, network(3)).catch(() => {}),
  );
  expect(await idle).toBe(2);
  expect(performance.now() - started).toBeLessThan(2500);
  run.abort();
});

test('a box that never answers ping fails the run rather than holding it', async () => {
  const started = performance.now();
  const failed = measure('adaptive', () => {}, new AbortController().signal, undefined, network(0));
  expect(failed).rejects.toThrow('did not answer ping');
  await failed.catch(() => {});
  expect(performance.now() - started).toBeLessThan(4500);
});
