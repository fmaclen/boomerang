import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Ports come from .env (see scripts/worktree-setup.py). The suite builds the
// page and runs it through `vite preview` on PREVIEW_PORT, so what is tested
// is the static output that ships. Set BASE_URL to test a server that is
// already running, for example the Docker stack.
function env(name: string): string {
  const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env; run scripts/worktree-setup.py`);
  return line.slice(name.length + 1).trim();
}

const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${env('PREVIEW_PORT')}`;
// The landing page and its demo (bun run build:site), served as Cloudflare Pages will.
const siteURL = `http://127.0.0.1:${env('SITE_PORT')}`;
const SITE_SPECS = ['site.spec.ts', 'site-iphone.spec.ts'];

export default defineConfig({
  testDir: 'tests',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['iphone.spec.ts', 'press.spec.ts', ...SITE_SPECS],
      use: {
        ...devices['Desktop Chrome'],
        // Headless Chromium falls back to SwiftShader on a Mac; Metal puts WebGL
        // on the GPU so the clips under clips/ hold their frame rate.
        launchOptions: { args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] },
      },
    },
    // Safari's engine, for the phone screenshots in tests/iphone.spec.ts and the tap on Start in tests/press.spec.ts.
    { name: 'webkit', testMatch: ['iphone.spec.ts', 'press.spec.ts'], use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 } },
    // The landing page, in Chromium and, for its phone screenshots, in WebKit.
    {
      name: 'site',
      testMatch: 'site.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: siteURL, launchOptions: { args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] } },
    },
    { name: 'site-webkit', testMatch: 'site-iphone.spec.ts', use: { ...devices['Desktop Safari'], deviceScaleFactor: 1, baseURL: siteURL } },
  ],
  webServer: [
    ...(process.env.BASE_URL
      ? []
      : [{ command: 'bun run build && bun run preview', url: baseURL, reuseExistingServer: false, timeout: 60_000 }]),
    { command: 'bun run site', url: siteURL, reuseExistingServer: false, timeout: 120_000 },
  ],
});
