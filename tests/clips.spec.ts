import { WIDTHS, recordClip, runTest, throttle, test } from './helpers';

// The run is judged by watching it, so each clip covers one adaptive run from
// the press of start to the settled result: throttled to 50 Mbps for the calm
// end of the scale, and unthrottled on the loopback for the wild end.

// The page has one screencast, sized by whoever starts it first. Trace
// screenshots would start it capped at 800 px, shrinking the clips, so the
// trace here keeps everything but its screenshots.
test.use({ trace: { mode: 'retain-on-failure', screenshots: false } });

for (const speed of ['slow', 'fast'] as const) {
  for (const [width, viewport] of Object.entries(WIDTHS) as [keyof typeof WIDTHS, { width: number; height: number }][]) {
    test.describe(`${speed} ${width}`, () => {
      test.use({ viewport });

      test('records a run', async ({ page }) => {
        if (speed === 'slow') await throttle(page);
        await page.goto('/');
        await recordClip(page, speed, width, () => runTest(page, 'adaptive'));
      });
    });
  }
}
