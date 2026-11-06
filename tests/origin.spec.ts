import { expect } from '@playwright/test';
import { openHistory, runTest, throttle, test } from './helpers';

test('every request through load, a run and the history view stays on the page origin', async ({ page, baseURL }) => {
  await throttle(page);
  const origin = new URL(baseURL!).origin;
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await page.goto('/');
  await runTest(page, 'adaptive');
  await page.getByTestId('new-run').click();
  await openHistory(page);
  await expect(page.getByTestId('history-item')).toHaveCount(1);

  expect(requested.length).toBeGreaterThan(0);
  const offOrigin = requested.filter((url) => new URL(url).origin !== origin);
  expect(offOrigin).toEqual([]);
});
