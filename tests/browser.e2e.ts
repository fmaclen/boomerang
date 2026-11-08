import { expect, test } from '@playwright/test';

// A box started with HISTORY=browser: each browser keeps its own runs.

test("a run's address opens it on reload, and after a clear it is gone from this page too", async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/history\/.+/);
  const address = page.url();
  await page.reload();
  await expect(page.getByTestId('history-details')).toBeVisible();
  await page.getByTestId('history-toggle').click();
  await page.getByTestId('history-clear').click();
  await page.getByTestId('history-clear-confirm').click();
  await expect(page.getByText('No tests yet')).toBeVisible();
  await page.goto(address);
  await expect(page.getByTestId('history-missing')).toBeVisible();
});
