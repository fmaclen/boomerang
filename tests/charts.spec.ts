import { expect, type Page } from '@playwright/test';
import { WIDTHS, fixtureHistory, openHistory, runTest, seedHistory, throttle, waitForSettled, storedRuns, test } from './helpers';

// A chart's line ends on the last reading, not on zero, and a saved run keeps
// the meter's readings ten a second, so the run reopened from History draws
// the line the live chart drew. Runs saved with one sample a second still open.

test.use({ viewport: WIDTHS.desktop });
test.setTimeout(90_000);

/** Points across each chart's line. */
const POINTS = 40;

interface Line {
  /** The line's height over the chart (0 at the foot, 1 at the top) at POINTS places across, the last 3 px in from its end. */
  heights: number[];
  /**
   * How much of the chart's last column, from just under the line's end down
   * to the end tick, is opaque: none where the line holds its last reading,
   * all of it where the line falls to the baseline at its end.
   */
  fall: number;
}

function lines(page: Page): Promise<Line[]> {
  return page.evaluate(
    (n) =>
      [...document.querySelectorAll<HTMLCanvasElement>('#charts canvas')].map((c) => {
        const { width: w, height: h } = c;
        const px = w / c.clientWidth;
        const d = c.getContext('2d')!.getImageData(0, 0, w, h).data;
        // The line is the topmost opaque ink in a column; the fill under it is faint.
        const opaque = (x: number, y: number) => d[(y * w + x) * 4 + 3] >= 128;
        const top = (x: number) => {
          for (let y = 0; y < h; y++) if (opaque(x, y)) return y;
          return h;
        };
        const heights = Array.from({ length: n }, (_, i) => 1 - top(Math.min(Math.round(((i + 1) / n) * w), w - 1 - Math.ceil(3 * px))) / h);
        const x = w - 1;
        const from = top(x) + Math.ceil(4 * px);
        const to = h - Math.ceil(10 * px);
        let covered = 0;
        for (let y = from; y < to; y++) if (opaque(x, y)) covered++;
        return { heights, fall: to > from ? covered / (to - from) : 0 };
      }),
    POINTS,
  );
}

const middle = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];

test('a chart holds its last reading, and the reopened run draws the same line from its finer samples', async ({ page }) => {
  await throttle(page);
  await page.goto('/');
  await runTest(page, 'adaptive');
  await waitForSettled(page);

  const live = await lines(page);
  for (const line of live) expect(line.fall, 'the line falls at its end').toBeLessThan(0.2);

  const saved = storedRuns(page)[0];
  for (const transfer of [saved.download, saved.upload]) {
    expect(transfer.samples.length).toBeGreaterThanOrEqual(8 * transfer.seconds);
  }

  await page.getByTestId('new-run').click();
  await openHistory(page);
  await page.getByTestId('history-item').first().click();
  await expect(page.getByTestId('history-details')).toBeVisible();
  await waitForSettled(page);
  await page.waitForTimeout(600);

  const reopened = await lines(page);
  reopened.forEach((line, i) => {
    expect(line.fall, 'the reopened line falls at its end').toBeLessThan(0.2);
    const apart = line.heights.reduce((sum, v, j) => sum + Math.abs(v - live[i].heights[j]), 0) / POINTS;
    expect(apart, 'the reopened line strays from the live one').toBeLessThan(0.03);
  });
});

test('a run saved with one sample a second still opens with its line', async ({ page }) => {
  await seedHistory(page, fixtureHistory());
  await page.goto('/');
  await openHistory(page);
  const legacy = page.getByTestId('history-item').nth(2);
  await expect(legacy).toHaveAttribute('data-id', 'fixture-3');
  await legacy.click();
  await expect(page.getByTestId('history-details')).toBeVisible();
  await waitForSettled(page);
  await page.waitForTimeout(600);
  for (const line of await lines(page)) {
    expect(middle(line.heights)).toBeGreaterThan(0.5);
    expect(line.fall).toBeLessThan(0.2);
  }
});
