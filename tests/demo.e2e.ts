import { expect, test } from '@playwright/test';

// The public demo, as a static host serves it, here under /demo/: the app
// built with --mode demo, reading a simulated gigabit link
// (src/lib/engine/simulate.ts).

test('a demo run reads a simulated gigabit link and asks nothing of a box', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => asked.push(new URL(r.url()).pathname));
  await page.goto('./');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('demo-note')).toBeVisible();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  for (const id of ['result-download', 'result-upload']) {
    const mbps = Number((await page.getByTestId(id).innerText()).match(/[\d.]+/)![0]);
    expect(mbps).toBeGreaterThan(800);
    expect(mbps).toBeLessThan(1000);
  }
  // Its History opens with a few past runs, and the visitor's own on top.
  await page.getByTestId('new-run').click();
  await page.getByTestId('history-toggle').click();
  await expect(page.getByTestId('history-item')).toHaveCount(6);
  await expect(page.getByTestId('history-item').first()).toContainText('Just now');
  expect(asked.filter((path) => /^\/(ping|downloading|upload|runs)\b/.test(path))).toEqual([]);
});

test("the demo's History key leads to a page the site has", async ({ page, request }) => {
  await page.goto('./');
  const href = await page.getByTestId('history-toggle').getAttribute('href');
  expect((await request.get(href!)).status()).toBe(200);
  await page.goto(href!);
  await expect(page.getByTestId('history-item')).toHaveCount(5);
  // A past run's own page reloads from the static host.
  await page.getByTestId('history-item').first().getByRole('link').click();
  await expect(page).toHaveURL(/\/demo\/history\/demo-/);
  await page.reload();
  await expect(page.getByTestId('history-details')).toBeVisible();
});
