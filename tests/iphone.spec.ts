import { expect } from '@playwright/test';
import {
  FIXED_RUN_LIMIT_MS,
  WIDTHS,
  expectNoHorizontalOverflow,
  fixtureHistory,
  longHistory,
  openHistory,
  readResult,
  reopenFixedRun,
  runTest,
  screenshot,
  seedHistory,
  shootFixedRun,
  waitForSettled,
  test,
} from './helpers';

// iPhones run Safari, so the phone states are also drawn in WebKit, the
// engine behind it. WebKit has no network emulation, so nothing here is
// throttled and the rates are the loopback's; the throttled checks stay in
// Chromium. Runs only in the `webkit` project.
test.setTimeout(180_000);
test.use({ viewport: WIDTHS.phone });

async function shoot(page: import('@playwright/test').Page, state: string): Promise<void> {
  await screenshot(page, state, 'iphone');
  await expectNoHorizontalOverflow(page);
}

test('idle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('start')).toBeVisible();
  await page.waitForTimeout(1_000);
  await shoot(page, 'idle');
});

test('adaptive result', async ({ page }) => {
  await page.goto('/');
  await runTest(page, 'adaptive');
  expect((await readResult(page)).download).toBeGreaterThan(0);
  await waitForSettled(page);
  await shoot(page, 'adaptive-result');
});

test('fixed run, each phase and the result', async ({ page }) => {
  await page.goto('/');
  await shootFixedRun(page, (state) => shoot(page, state));
  await expect(page.getByTestId('result')).toBeVisible({ timeout: FIXED_RUN_LIMIT_MS });
  await waitForSettled(page);
  await shoot(page, 'fixed-result');
});

test('history', async ({ page }) => {
  await seedHistory(page, fixtureHistory());
  await page.goto('/');
  await openHistory(page);
  await expect(page.getByTestId('history-item')).toHaveCount(3);
  await page.waitForTimeout(600);
  await shoot(page, 'history');
});

test('history after Load more', async ({ page }) => {
  await seedHistory(page, longHistory(25));
  await page.goto('/');
  await openHistory(page);
  await expect(page.getByTestId('history-item')).toHaveCount(10);
  await page.waitForTimeout(600);
  await page.getByTestId('history-more').click();
  await expect(page.getByTestId('history-item')).toHaveCount(20);
  await page.waitForTimeout(600);
  await shoot(page, 'history-more');
});

test('a reopened run', async ({ page }) => {
  await seedHistory(page, fixtureHistory());
  await page.goto('/');
  await reopenFixedRun(page);
  await shoot(page, 'history-run');
});

test('empty history', async ({ page }) => {
  await page.goto('/');
  await openHistory(page);
  await expect(page.getByText('No tests yet')).toBeVisible();
  await page.waitForTimeout(600);
  await shoot(page, 'history-empty');
});
