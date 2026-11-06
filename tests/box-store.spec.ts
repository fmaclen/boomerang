import { expect, test, type Page } from '@playwright/test';
import type { Result } from '../src/lib/engine/types';
import { closeHistory, fixtureHistory, openHistory, pageReady, runTest, setHistoryMode, throttle } from './helpers';

// Against the box's own store, the one every browser on the box shares, not
// the per-test store the other specs answer /runs from. Each test empties it
// first.

const TEST_TRAFFIC = ['/ping', '/downloading', '/upload'];

test.beforeEach(async ({ baseURL }) => {
  const response = await fetch(new URL('/runs', baseURL), { method: 'DELETE' });
  expect(response.status).toBe(204);
});

test('two browsers on the box see the same History, and a Clear from one empties both', async ({ browser, baseURL }) => {
  const taker = await (await browser.newContext({ baseURL })).newPage();
  const viewer = await (await browser.newContext({ baseURL })).newPage();
  await throttle(taker);

  await viewer.goto('/history');
  await expect(viewer.getByText('No tests yet')).toBeVisible();

  await taker.goto('/');
  await runTest(taker, 'adaptive');
  const [run] = await boxRuns(baseURL!);
  expect(run).toBeDefined();

  // Reopening History fetches the box's runs again: the run taken in the other browser is listed.
  await closeHistory(viewer);
  await openHistory(viewer);
  const rows = viewer.getByTestId('history-item');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByTestId('history-time')).toHaveAttribute('datetime', new Date(run.startedAt).toISOString());

  await taker.getByTestId('new-run').click();
  await openHistory(taker);
  await expect(taker.getByTestId('history-item')).toHaveCount(1);

  await viewer.getByTestId('history-clear').click();
  await viewer.getByTestId('history-clear-confirm').click();
  await expect(viewer.getByText('No tests yet')).toBeVisible();
  await expect.poll(() => boxRuns(baseURL!)).toEqual([]);

  await closeHistory(taker);
  await openHistory(taker);
  await expect(taker.getByTestId('history-item')).toHaveCount(0);
  await expect(taker.getByText('No tests yet')).toBeVisible();
});

test('history kept in the browser: nothing leaves the page but the test traffic', async ({ page, baseURL }) => {
  await throttle(page);
  await setHistoryMode(page, 'browser');
  const paths: string[] = [];
  page.on('request', (request) => paths.push(new URL(request.url()).pathname));

  await page.goto('/');
  await pageReady(page);
  const loaded = paths.length;
  await openHistory(page);
  await expect(page.getByText('Finished tests are kept in this browser')).toBeVisible();
  await closeHistory(page);

  await runTest(page, 'adaptive');
  await page.getByTestId('new-run').click();
  await openHistory(page);
  await expect(page.getByTestId('history-item')).toHaveCount(1);

  const later = paths.slice(loaded);
  expect(later.length).toBeGreaterThan(0);
  expect(later.filter((path) => !TEST_TRAFFIC.includes(path))).toEqual([]);
  expect(paths).not.toContain('/runs');

  const kept = await localRuns(page);
  expect(kept).toHaveLength(1);
  expect(kept[0].mode).toBe('adaptive');
  expect(await boxRuns(baseURL!)).toEqual([]);
});

test("a browser's own runs go to the box once, and a Clear stays cleared", async ({ page, baseURL }) => {
  const own = fixtureHistory();
  await page.addInitScript((value) => {
    if (!localStorage.getItem('boomerang.history')) localStorage.setItem('boomerang.history', value);
  }, JSON.stringify(own));

  await page.goto('/');
  await openHistory(page);
  await expect(page.getByTestId('history-item')).toHaveCount(own.length);
  expect((await boxRuns(baseURL!)).map((r) => r.id)).toEqual(own.map((r) => r.id));

  await page.getByTestId('history-clear').click();
  await page.getByTestId('history-clear-confirm').click();
  await expect(page.getByText('No tests yet')).toBeVisible();
  await expect.poll(() => boxRuns(baseURL!)).toEqual([]);

  await page.reload();
  await openHistory(page);
  await expect(page.getByText('No tests yet')).toBeVisible();
  expect(await boxRuns(baseURL!)).toEqual([]);
  // The browser's own copy is left in place, for a box that goes back to keeping runs in the browser.
  expect((await localRuns(page)).map((r) => r.id)).toEqual(own.map((r) => r.id));
});

/** Read with Node's fetch rather than Playwright's request fixture, whose trace teardown races with the test's own. */
async function boxRuns(baseURL: string): Promise<Result[]> {
  const response = await fetch(new URL('/runs', baseURL));
  return (await response.json()) as Result[];
}

async function localRuns(page: Page): Promise<Result[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('boomerang.history') ?? '[]'));
}
