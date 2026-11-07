import { devices, expect, test, type Page } from '@playwright/test';
import type { Result } from '../src/lib/engine/types';

// The README's screenshots and a clip of a Quick run, on a phone and a
// desktop, with the scene on: `bun run shots`. A real run over a link
// throttled to 50 Mbps down and 10 up, then History with three past runs.

const FORMS = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
  phone: { viewport: devices['iPhone 17'].viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

const past = (i: number, os: string, form: 'Desktop' | 'Mobile', down: number, up: number): Result => {
  const samples = Array.from({ length: 40 }, (_, k) => ({ t: (k + 1) / 10, mbps: down }));
  return {
    id: `shot-${i}`,
    startedAt: Date.now() - [5, 26 * 60, 3 * 24 * 60][i] * 60_000,
    mode: i === 2 ? 'fixed' : 'adaptive',
    download: { mbps: down, bytes: down * 5e5, seconds: 4, samples },
    upload: { mbps: up, bytes: up * 5e5, seconds: 4, samples },
    latency: { idleMs: 2 + i, jitterMs: 0.3 },
    device: { os, form, browser: 'Safari' },
  };
};

async function throttle(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: 50e6 / 8, uploadThroughput: 10e6 / 8 });
}

for (const [form, use] of Object.entries(FORMS)) {
  test(`a Quick run, then History, on a ${form}`, async ({ browser, baseURL, request }) => {
    await request.delete('/runs', { headers: { 'Content-Type': 'application/json' } });
    const context = await browser.newContext({ ...use, baseURL, recordVideo: { dir: 'test-results/shots', size: use.viewport } });
    const page = await context.newPage();
    await throttle(page);
    await page.goto('/');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `screenshots/idle-${form}.png` });
    await page.getByTestId('start').click();
    await expect(page.locator('[data-phase="download"]')).toBeAttached({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `screenshots/download-${form}.png` });
    await expect(page.locator('[data-testid="result"][data-settled]')).toBeVisible({ timeout: 40_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/adaptive-result-${form}.png` });

    for (const run of [past(0, 'iPhone', 'Mobile', 312, 48.6), past(1, 'macOS', 'Desktop', 941, 913), past(2, 'Windows', 'Desktop', 468, 102)])
      await request.post('/runs', { data: run });
    await page.getByTestId('new-run').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('history-toggle').click();
    await expect(page.getByTestId('history-item')).toHaveCount(4);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `screenshots/history-${form}.png` });
    await page.getByTestId('history-item').first().getByRole('link').click();
    await page.waitForTimeout(2500);
    await context.close();
    await page.video()?.saveAs(`clips/${form}.webm`);
  });
}
