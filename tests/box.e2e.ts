import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { Result } from '../src/lib/engine/types';

// The box as it ships: the built server, its routes and a store of its own.
// Each test starts from an empty store.

test.beforeEach(async ({ request }) => {
  expect((await request.delete('/runs', { headers: { 'Content-Type': 'application/json' } })).status()).toBe(204);
});

/** A finished run as the page saves it, i minutes old. */
function run(i: number): Result {
  const samples = Array.from({ length: 40 }, (_, k) => ({ t: (k + 1) / 10, mbps: 100 + i }));
  const transfer = (mbps: number) => ({ mbps, bytes: mbps * 5e5, seconds: 4, samples });
  return {
    id: `run-${i}`,
    startedAt: Date.now() - i * 60_000,
    mode: 'adaptive',
    download: transfer(100 + i),
    upload: transfer(20 + i),
    latency: { idleMs: 3, jitterMs: 0.5 },
    device: { os: 'macOS', form: 'Desktop', browser: 'Chrome' },
  };
}

async function seed(request: APIRequestContext, n: number): Promise<void> {
  for (let i = 0; i < n; i++) expect((await request.post('/runs', { data: run(i) })).status()).toBe(201);
}

/** The figure shown, in Mbps whichever unit it reads in. */
async function mbps(page: Page, id: string): Promise<number> {
  const text = await page.getByTestId(id).innerText();
  const [, value, unit] = text.match(/([\d.]+)\s*(Gbps|Mbps)/)!;
  return Number(value) * (unit === 'Gbps' ? 1000 : 1);
}

test('a quick run over a throttled link lands within 15% of it, takes its own address once saved, and asks nothing of another origin', async ({
  page,
  request,
  baseURL,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: 50e6 / 8, uploadThroughput: 10e6 / 8 });
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));

  await page.goto('/');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 40_000 });
  expect(await mbps(page, 'result-download')).toBeGreaterThan(50 * 0.85);
  expect(await mbps(page, 'result-download')).toBeLessThan(50 * 1.15);
  expect(await mbps(page, 'result-upload')).toBeGreaterThan(10 * 0.85);
  expect(await mbps(page, 'result-upload')).toBeLessThan(10 * 1.15);

  // Saved, the run is at its own address; reloaded there, it is the same run.
  const [saved] = (await (await request.get('/runs')).json()).runs;
  await expect(page).toHaveURL(`/history/${saved.id}`);
  const down = (await page.getByTestId('result-download').textContent())!;
  await page.reload();
  await expect(page.getByTestId('history-details')).toBeVisible();
  await expect(page.getByTestId('result-download')).toHaveText(down);

  // Back is home, as before the run; forward is the run again.
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('start')).toBeEnabled();
  await page.goForward();
  await expect(page.getByTestId('result-download')).toHaveText(down);
  await page.getByTestId('history-toggle').click();
  await expect(page.getByTestId('history-item')).toHaveCount(1);
  await expect(page.getByTestId('history-item')).toContainText('Quick');

  expect(requested.filter((url) => new URL(url).origin !== new URL(baseURL!).origin)).toEqual([]);
});

test('Stop mid-run saves nothing', async ({ page, request }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  await expect(page.locator('[data-phase="download"]')).toBeAttached({ timeout: 15_000 });
  await page.getByTestId('stop').click();
  await expect(page.getByTestId('start')).toBeEnabled();
  await page.getByTestId('history-toggle').click();
  await expect(page.getByText('No tests yet')).toBeVisible();
  expect((await (await request.get('/runs')).json()).runs).toEqual([]);
});

test('History lists ten runs at a time down a page that scrolls, opens one at its own address, goes back to the list as it was, and clears', async ({
  page,
  request,
}) => {
  await seed(request, 25);
  await page.goto('/history');
  const rows = page.getByTestId('history-item');
  await expect(rows).toHaveCount(10);
  await page.getByTestId('history-more').click();
  await expect(rows).toHaveCount(20);
  await page.getByTestId('history-more').click();
  await expect(rows).toHaveCount(25);
  await expect(page.getByTestId('history-more')).toBeHidden();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);

  await rows.nth(3).getByRole('link').click();
  await expect(page).toHaveURL('/history/run-3');
  const details = page.getByTestId('history-details');
  await expect(details).toBeVisible();
  await expect(details).toContainText('Quick');
  await expect(page.getByTestId('result-download')).toContainText('103');
  await page.goBack();
  await expect(page).toHaveURL('/history');
  await expect(details).toBeHidden();
  await expect(rows).toHaveCount(25);
  await page.goForward();
  await expect(details).toBeVisible();
  await page.getByTestId('history-toggle').click();
  await expect(details).toBeHidden();

  await page.getByTestId('history-clear').click();
  await page.getByTestId('history-clear-confirm').click();
  await expect(page.getByText('No tests yet')).toBeVisible();
  expect((await (await request.get('/runs')).json()).runs).toEqual([]);
});

test('the result shows as soon as the run is measured, however long the box takes to save it', async ({ page }) => {
  await page.route('**/runs', (route) => (route.request().method() === 'POST' ? new Promise(() => {}) : route.fallback()));
  await page.goto('/');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  // Unsaved, it keeps home's address; it is listed all the same, and History opens straight over it.
  await expect(page).toHaveURL('/');
  await page.getByTestId('history-toggle').click();
  await expect(page.getByTestId('history-toggle')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('history-item')).toHaveCount(1);
});

test('a clear the box refuses keeps the runs and says so', async ({ page, request }) => {
  await seed(request, 2);
  await page.route('**/runs', (route) => (route.request().method() === 'DELETE' ? route.fulfill({ status: 500 }) : route.fallback()));
  await page.goto('/history');
  await page.getByTestId('history-clear').click();
  await page.getByTestId('history-clear-confirm').click();
  await expect(page.getByTestId('history-clear-failed')).toBeVisible();
  await expect(page.getByTestId('history-item')).toHaveCount(2);
  await expect(page.getByTestId('history-item').first()).toBeVisible();
});

test('a damaged record in the store leaves the rest of History standing', async ({ page }) => {
  const good = run(0);
  const bad = [{ ...run(1), startedAt: 1e100 }, { ...run(2), download: { ...run(2).download, seconds: 1e9 } }, {}];
  await page.route(
    (url) => url.pathname === '/runs',
    (route) => route.fulfill({ json: { runs: [good, ...bad], more: false } }),
  );
  await page.goto('/history');
  await expect(page.getByTestId('history-item')).toHaveCount(1);
});

test("box History loads even when this browser's storage throws", async ({ page, request }) => {
  await seed(request, 1);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  await page.goto('/history');
  await expect(page.getByTestId('history-item')).toHaveCount(1);
});

test('home never waits on the store, and never asks it for runs', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => r.url().includes('/runs') && asked.push(r.url()));
  await page.route('**/runs*', () => new Promise(() => {}));
  await page.goto('/');
  await expect(page.getByTestId('start')).toBeEnabled({ timeout: 2_000 });
  await page.waitForTimeout(500);
  expect(asked).toEqual([]);
});

test("a run's address opens it cold, and an address History doesn't have says so", async ({ page, request }) => {
  await seed(request, 3);
  await page.goto('/history/run-2');
  await expect(page.getByTestId('history-details')).toBeVisible();
  await expect(page.getByTestId('result-download')).toContainText('102');
  await page.goto('/history/nope');
  await expect(page.getByTestId('history-missing')).toBeVisible();
});

test('text is text: a click on it lands on it and selects it, never the scene', async ({ page, request }) => {
  await seed(request, 1);
  await page.goto('/history/run-0');
  const value = page.getByTestId('history-details').locator('dd').filter({ hasText: 'Quick' });
  const box = (await value.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('dd')?.textContent, [x, y])).toContain('Quick');
  await page.mouse.click(x, y, { clickCount: 3 });
  expect(await page.evaluate(() => getSelection()?.toString())).toContain('Quick');
});
