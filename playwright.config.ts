import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Ports come from .env (see scripts/worktree-setup.py). The suite builds the
// box and runs it as it ships (`bun build/index.js`, its runs in a throwaway
// database), and builds the demo and previews it. WebGL is off: the tests
// check behaviour, and the page runs without its scene. Screenshots and clips
// for the README come from `bun run shots`, with the scene on.
function env(name: string): string {
  const line = readFileSync('.env', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env; run scripts/worktree-setup.py`);
  return line.slice(name.length + 1).trim();
}

const PORT = env('PREVIEW_PORT');
const SITE_PORT = env('SITE_PORT');
const BROWSER_PORT = env('BROWSER_PORT');
const box = `http://127.0.0.1:${PORT}`;
// The demo is served under a base path, as it would be anywhere but a site's root.
const site = `http://127.0.0.1:${SITE_PORT}/demo/`;
const noGL = { args: ['--disable-webgl', '--disable-3d-apis'] };
// The scene drawn in software, as on a runner with no GPU.
const softGL = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
const gpu = { args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] };

export default defineConfig({
  testDir: 'tests',
  outputDir: 'test-results',
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  projects: [
    { name: 'box', testMatch: 'box.e2e.ts', use: { baseURL: box, launchOptions: noGL } },
    { name: 'browser', testMatch: 'browser.e2e.ts', use: { baseURL: `http://127.0.0.1:${BROWSER_PORT}`, launchOptions: noGL } },
    { name: 'scene', testMatch: 'scene.e2e.ts', use: { baseURL: box, launchOptions: softGL } },
    { name: 'demo', testMatch: 'demo.e2e.ts', use: { baseURL: site, launchOptions: noGL } },
    ...(process.env.SHOTS ? [{ name: 'shots', testMatch: 'shots.ts', timeout: 180_000, use: { baseURL: box, launchOptions: gpu } }] : []),
  ],
  webServer: [
    { command: 'bun run build && bun tests/boxes.ts', env: { PREVIEW_PORT: PORT, BROWSER_PORT }, url: `${box}/ping`, timeout: 120_000 },
    { command: `bun run build --mode demo && bun run preview --mode demo --port ${SITE_PORT}`, env: { BASE_PATH: '/demo' }, url: site, timeout: 120_000 },
  ],
});
