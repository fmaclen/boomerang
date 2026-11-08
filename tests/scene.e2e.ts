import { expect, test, type Page } from '@playwright/test';

// With the scene drawn (in software): it runs without errors, and a scene
// that cannot start leaves the page working without it.

async function runAndStop(page: Page): Promise<void> {
  await page.getByTestId('start').click();
  await expect(page.locator('[data-phase="download"]')).toBeAttached({ timeout: 15_000 });
  await page.getByTestId('stop').click();
  await expect(page.getByTestId('start')).toBeEnabled();
}

test('the scene runs a run without an error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await runAndStop(page);
  expect(errors).toEqual([]);
});

test('a scene whose shaders fail to start leaves the page working', async ({ page }) => {
  await page.addInitScript(() => {
    WebGL2RenderingContext.prototype.getShaderParameter = () => false;
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await runAndStop(page);
  expect(errors).toEqual([]);
});
