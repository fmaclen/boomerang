import { expect, type Page } from '@playwright/test';
import { WIDTHS, test } from './helpers';

// A tap on Start, in WebKit at the phone's size: it never gives under the
// finger, its exit is one motion (a slight swell, then the collapse) that
// drops no frame, and the run is measuring before the disc has gone.
// Recording the screen takes frames of its own, and so does the trace, which
// grabs the screen as it goes. So the frames are counted on a tap that is
// neither recorded nor traced, and a second tap is recorded to
// clips/start-press-iphone.webm. Runs only in the `webkit` project.
test.use({ viewport: WIDTHS.phone, trace: 'off' });

/** Start's exit, from the timeline: the swell peaks at START_SWELL_T and the disc is gone by START_GONE. */
const START_SWELL_T = 0.16;
const START_GONE = 0.4;

interface Tap {
  /** Each frame: when, Start's width on screen, and its centre's height. */
  disc: number[][];
  downAt: number;
  clickAt: number;
  /** When the first latency probe left, from the press, in ms. */
  pingAfter: number;
}

/** Loads the page and taps Start the way a finger does, held for 120 ms, noting every frame until the run is well under way. */
async function tapStart(page: Page, clip?: string): Promise<Tap> {
  await page.addInitScript(() => {
    const w = window as unknown as { __disc: number[][]; __downAt: number; __clickAt: number };
    w.__disc = [];
    addEventListener('pointerdown', () => (w.__downAt = performance.now()), true);
    addEventListener('click', () => (w.__clickAt = performance.now()), true);
    const tick = (ts: number) => {
      const r = document.getElementById('start')?.getBoundingClientRect();
      if (r) w.__disc.push([ts, r.width, r.top + r.height / 2]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  let pingAt = Infinity;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/ping') pingAt = Math.min(pingAt, Date.now());
  });
  await page.goto('/');
  const start = page.getByTestId('start');
  await start.waitFor();
  await page.waitForTimeout(1_500);
  if (clip) await page.screencast.start({ path: clip, size: WIDTHS.phone, fps: 60 });
  await page.waitForTimeout(400);
  await start.hover();
  const downWall = Date.now();
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(1_200);
  if (clip) await page.screencast.stop();
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __disc: number[][]; __downAt: number; __clickAt: number };
    return { disc: w.__disc, downAt: w.__downAt, clickAt: w.__clickAt };
  });
  return { ...seen, pingAfter: pingAt - downWall };
}

/** Held down, let go, and swelling, Start is never smaller than at rest and never lower; from its peak it only shrinks, to nothing. */
function expectOneMotion({ disc, downAt, clickAt }: Tap): void {
  const rest = disc.filter(([ts]) => ts < downAt);
  const [, restW, restY] = rest[rest.length - 1];
  const between = (a: number, b: number) => disc.filter(([ts]) => ts >= a && ts < b);
  for (const [, w, y] of between(downAt, clickAt + START_SWELL_T * 1000)) {
    expect(w).toBeGreaterThanOrEqual(restW - 0.5);
    expect(Math.abs(y - restY)).toBeLessThan(0.5);
  }
  // Layout rounds the disc's width, so a change under 0.05 px is no change.
  const exit = between(clickAt, clickAt + (START_GONE + 0.1) * 1000);
  const peak = exit.findIndex(([, w], i) => i > 0 && w < exit[i - 1][1] - 0.05) - 1;
  expect(peak).toBeGreaterThan(0);
  for (let i = peak + 1; i < exit.length; i++) expect(exit[i][1]).toBeLessThanOrEqual(exit[i - 1][1] + 0.05);
  expect(exit[exit.length - 1][1]).toBe(0);
}

test('a tap on Start sets off one unbroken exit, with the run under way', async ({ page }) => {
  const tap = await tapStart(page);
  expectOneMotion(tap);
  const { disc, downAt, clickAt } = tap;
  const idle = disc.filter(([ts]) => ts < downAt).slice(-60);
  const gaps = idle
    .slice(1)
    .map(([ts], i) => ts - idle[i][0])
    .sort((a, b) => a - b);
  const frame = gaps[gaps.length >> 1];
  const frames = disc.filter(([ts]) => ts >= downAt - 20 && ts < clickAt + START_GONE * 1000);
  for (let i = 1; i < frames.length; i++) {
    const gap = frames[i][0] - frames[i - 1][0];
    expect(gap, `a ${gap} ms frame ${Math.round(frames[i - 1][0] - clickAt)} ms from the click`).toBeLessThan(frame * 1.6);
  }
  expect(tap.pingAfter).toBeLessThan(clickAt - downAt + START_GONE * 1000);
});

test('a tap on Start, recorded', async ({ page }) => {
  expectOneMotion(await tapStart(page, 'clips/start-press-iphone.webm'));
});
