import { expect, type Page } from '@playwright/test';
import {
  ADAPTIVE_RUN_LIMIT_MS,
  FIXED_RUN_LIMIT_MS,
  THROTTLE,
  WIDTHS,
  expectNoHorizontalOverflow,
  expectWithinTolerance,
  fixtureHistory,
  longHistory,
  openHistory,
  readResult,
  reopenFixedRun,
  runTest,
  screenshot,
  seedHistory,
  shootFixedRun,
  throttle,
  waitForSettled,
  storedRuns,
  test,
} from './helpers';

// A fixed run is a minute; the timeout fits two with room for the rest.
test.setTimeout(180_000);

for (const [width, viewport] of Object.entries(WIDTHS) as [keyof typeof WIDTHS, { width: number; height: number }][]) {
  test.describe(width, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await throttle(page);
    });

    /** Every phone screenshot doubles as the check that nothing overflows the phone's width. */
    async function shoot(page: Page, state: string): Promise<void> {
      await screenshot(page, state, width);
      if (width === 'phone') await expectNoHorizontalOverflow(page);
    }

    test('idle', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('start')).toBeVisible();
      await page.waitForTimeout(1_000);
      await shoot(page, 'idle');
    });

    test('adaptive run lands within tolerance in under twenty seconds', async ({ page }) => {
      await page.goto('/');
      const tookMs = await runTest(page, 'adaptive');
      expect(tookMs).toBeLessThan(ADAPTIVE_RUN_LIMIT_MS);

      const result = await readResult(page);
      for (const value of Object.values(result)) expect(Number.isFinite(value)).toBe(true);
      console.log(`adaptive ${width}: ${result.download} down, ${result.upload} up, ${tookMs} ms`);
      expectWithinTolerance(result.download, THROTTLE.downloadMbps);
      expectWithinTolerance(result.upload, THROTTLE.uploadMbps);
      await waitForSettled(page);
      await shoot(page, 'adaptive-result');
    });

    test('fixed run lands within tolerance with ten samples a second', async ({ page }) => {
      await page.goto('/');
      await shootFixedRun(page, (state) => shoot(page, state));

      await expect(page.getByTestId('result')).toBeVisible({ timeout: FIXED_RUN_LIMIT_MS });
      const result = await readResult(page);
      console.log(`fixed ${width}: ${result.download} down, ${result.upload} up`);
      expectWithinTolerance(result.download, THROTTLE.downloadMbps);
      expectWithinTolerance(result.upload, THROTTLE.uploadMbps);
      await expect(page.getByTestId('samples-download')).toBeVisible();
      await expect(page.getByTestId('samples-upload')).toBeVisible();

      const saved = storedRuns(page)[0];
      expect(saved.mode).toBe('fixed');
      expect(saved.download.samples.length).toBeGreaterThanOrEqual(280);
      expect(saved.upload.samples.length).toBeGreaterThanOrEqual(280);
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
  });
}

// Unthrottled, the loopback lands in the thousands of Mbps on a modern machine,
// so this is where a four-digit rate has to fit the phone.
test.describe('phone, no throttle', () => {
  test.use({ viewport: WIDTHS.phone });

  test('adaptive run with four-digit rates fits the phone', async ({ page }) => {
    await page.goto('/');
    await runTest(page, 'adaptive');
    const result = await readResult(page);
    console.log(`fast phone: ${result.download} down, ${result.upload} up`);
    expect(result.download).toBeGreaterThan(0);
    await waitForSettled(page);
    await screenshot(page, 'fast-result', 'phone');
    await expectNoHorizontalOverflow(page);
  });
});
