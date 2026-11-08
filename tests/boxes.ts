// Runs the built box twice for the browser tests: on PREVIEW_PORT keeping
// runs in its own store, and on BROWSER_PORT keeping them in each browser.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const box = (port: string | undefined, env: Record<string, string>) =>
  Bun.spawn(['bun', 'run', 'start'], { env: { ...process.env, HOST: '127.0.0.1', PORT: port ?? '', ...env }, stdout: 'inherit', stderr: 'inherit' });

const runs = [
  box(process.env.BROWSER_PORT, { HISTORY: 'browser' }),
  box(process.env.PREVIEW_PORT, { HISTORY: 'box', RUNS_DB: join(tmpdir(), `boomerang-test-${process.env.PREVIEW_PORT}.sqlite`) }),
];
process.on('SIGTERM', () => runs.forEach((p) => p.kill()));
await Promise.all(runs.map((p) => p.exited));
