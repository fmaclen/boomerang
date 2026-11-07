import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Ports come from .env (see scripts/worktree-setup.py). The suite builds the
// box and runs it as it ships (`bun build/index.js`, its runs in a throwaway
// database), and builds the demo and serves it as static files. WebGL is off:
// the tests check behaviour, and the page runs without its scene. Screenshots
// and clips for the README come from `bun run shots`, with the scene on.
function env(name: string): string {
  const line = readFileSync('.env', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env; run scripts/worktree-setup.py`);
  return line.slice(name.length + 1).trim();
}

const PORT = env('PREVIEW_PORT');
const SITE_PORT = env('SITE_PORT');
const box = `http://127.0.0.1:${PORT}`;
// The demo is served under a base path, as it would be anywhere but a site's root.
const site = `http://127.0.0.1:${SITE_PORT}/demo/`;
const noGL = { args: ['--disable-webgl', '--disable-3d-apis'] };
const gpu = { args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] };

export default defineConfig({
  testDir: 'tests',
  outputDir: 'test-results',
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  projects: [
    { name: 'box', testMatch: 'box.e2e.ts', use: { baseURL: box, launchOptions: noGL } },
    { name: 'demo', testMatch: 'demo.e2e.ts', use: { baseURL: site, launchOptions: noGL } },
    ...(process.env.SHOTS ? [{ name: 'shots', testMatch: 'shots.ts', timeout: 180_000, use: { baseURL: box, launchOptions: gpu } }] : []),
  ],
  webServer: [
    {
      command: 'bun run build && bun build/index.js',
      env: { PORT, HOST: '127.0.0.1', RUNS_DB: join(tmpdir(), `boomerang-test-${PORT}.sqlite`) },
      url: `${box}/ping`,
      timeout: 120_000,
    },
    { command: 'bun run build:site && bun tests/serve-site.ts', env: { SITE_PORT, BASE_PATH: '/demo' }, url: site, timeout: 120_000 },
  ],
});
