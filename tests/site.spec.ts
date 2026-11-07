import { expect, test, type Page } from '@playwright/test';
import type { Result } from '../src/lib/engine/types';
import { WIDTHS, expectNoHorizontalOverflow, readResult, runTest, screenshot } from './helpers';
import { offline, siteReady } from './site';

// The landing page's demo is the app built with --mode demo: the real
// interface reading a simulated gigabit link (src/lib/engine/simulate.ts).
// Runs in the `site` project, against the built site.

test('a demo run reads an ordinary gigabit link and asks nothing of any server', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(new URL(request.url()).pathname));

  await page.goto('/demo/');
  await runTest(page, 'adaptive');

  const shown = await readResult(page);
  // The slowest link the simulation draws is 884 Mbps up; its drift can take
  // 3% off that, and one dip about 6% of a two-second measured window.
  for (const rate of [shown.download, shown.upload]) {
    expect(rate).toBeGreaterThan(800);
    expect(rate).toBeLessThan(1000);
  }
  expect(shown['latency-idle']).toBeLessThan(10);

  // The run as saved: its readings peak near a gigabit and never past it, and
  // wobble once the climb is over rather than drawing a flat line.
  const [run] = await page.evaluate(() => JSON.parse(localStorage.getItem('boomerang.history')!) as Result[]);
  for (const { samples } of [run.download, run.upload]) {
    const level = samples.filter((s) => s.t >= 1.5).map((s) => s.mbps);
    expect(Math.max(...level)).toBeGreaterThan(880);
    expect(Math.max(...level)).toBeLessThan(1000);
    expect(Math.max(...level) - Math.min(...level)).toBeGreaterThan(5);
  }

  expect(requested.length).toBeGreaterThan(0);
  expect(requested.filter((path) => /^\/(ping|downloading|upload|results)\b/.test(path))).toEqual([]);
});

test('the demo opens with past runs in History, and its own run lands on top', async ({ page }) => {
  await page.goto('/demo/');
  await runTest(page, 'adaptive');
  await page.getByTestId('new-run').click();
  await page.getByTestId('history-toggle').click();
  await expect(page).toHaveURL(/\/demo\/history$/);
  await expect(page.getByTestId('history-item')).toHaveCount(6);
  await page.reload();
  await expect(page.getByTestId('history-item')).toHaveCount(6);
});

test('the landing page names the latest release, says the demo is simulated, and counts visits in Plausible', async ({ page }) => {
  await offline(page);
  await page.setViewportSize(WIDTHS.desktop);
  await page.goto('/');

  await expect(page.getByTestId('release-tag')).toHaveText('v1.2.0');
  await expect(page.getByTestId('release')).toHaveAttribute('href', 'https://github.com/fmaclen/boomerang/releases/tag/v1.2.0');
  await expect(page.getByTestId('demo-note')).toContainText(/simulated/i);

  const plausible = page.locator('head script[data-domain]');
  await expect(plausible).toHaveAttribute('data-domain', 'boomerang.fernando.is');
  await expect(plausible).toHaveAttribute('src', /^https:\/\/plausible\.fernando\.is\//);

  await siteReady(page);
  await screenshot(page, 'site', 'desktop');
});

test('the landing page holds together on a phone', async ({ page }) => {
  await offline(page);
  await page.setViewportSize(WIDTHS.phone);
  await page.goto('/');
  await expect(page.getByTestId('release-tag')).toBeVisible();
  // Each key's label stays on one line, a capital's height.
  for (const label of ['Self-host', 'v1.2.0']) expect((await page.getByText(label, { exact: true }).boundingBox())!.height).toBeLessThan(12);
  await siteReady(page);
  await screenshot(page, 'site', 'phone');
  await expectNoHorizontalOverflow(page);
});

test('with no release from GitHub, the version key links to the releases page instead', async ({ page }) => {
  await offline(page, { status: 404 });
  const answered = page.waitForResponse(/releases\/latest/);
  await page.goto('/');
  await answered;
  const key = page.getByTestId('release');
  await expect(key).toHaveAccessibleName('Releases');
  await expect(key).toHaveAttribute('href', 'https://github.com/fmaclen/boomerang/releases');
  await expect(page.getByTestId('release-tag')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Self-host/ })).toBeVisible();
});

for (const [width, viewport] of Object.entries(WIDTHS)) {
  test(`on a ${width}, the demo fills the window under the bar and the page itself never scrolls`, async ({ page }) => {
    await offline(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    const bar = await page.locator('header').boundingBox();
    const frame = await page.locator('iframe[title="Boomerang demo"]').boundingBox();
    expect(frame!.y).toBe(bar!.y + bar!.height);
    expect(frame!.width).toBe(viewport.width);
    expect(frame!.y + frame!.height).toBe(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
  });
}

/** Over the next 1.2 s, the most the note and a key are ever on screen at once: 0 when one waits for the other. */
function overlap(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const opacity = (selector: string) => +getComputedStyle(document.querySelector(selector)!).opacity;
        const start = performance.now();
        let worst = 0;
        const tick = () => {
          worst = Math.max(worst, Math.min(opacity('[data-testid=demo-note]'), opacity('[data-testid=release]')));
          if (performance.now() - start < 1200) requestAnimationFrame(tick);
          else resolve(worst);
        };
        tick();
      }),
  );
}

test('the bar shows the keys until a test runs, the note while it runs, and the keys again after', async ({ page }) => {
  await offline(page);
  await page.goto('/');
  const note = page.getByTestId('demo-note');
  const keys = [page.getByRole('link', { name: 'Self-host with Docker' }), page.getByTestId('release')];
  const demo = page.frameLocator('iframe[title="Boomerang demo"]');
  for (const key of keys) await expect(key).toBeVisible();
  await expect(note).toBeHidden();

  const comingIn = overlap(page);
  await demo.getByTestId('start').click();
  expect(await comingIn).toBe(0);
  await expect(note).toBeVisible();
  for (const key of keys) await expect(key).toBeHidden();

  await expect(demo.getByTestId('result')).toBeVisible({ timeout: 20_000 });
  const goingHome = overlap(page);
  await demo.getByTestId('new-run').click();
  // The bar leaves at the press, while the app is still on its way home.
  await expect(note).toHaveAttribute('data-running', 'false');
  await expect(demo.locator('#dock')).toHaveAttribute('data-screen', 'run');
  expect(await goingHome).toBe(0);
  await expect(note).toBeHidden();
  for (const key of keys) await expect(key).toBeVisible();
});

for (const answer of [{}, { status: 404 }]) {
  test(`the demo note sits in the middle of the bar, between Self-host and the release ${answer.status ? 'before there is a release' : 'with a version'}`, async ({ page }) => {
    await offline(page, answer);
    for (const viewport of Object.values(WIDTHS)) {
      await page.setViewportSize(viewport);
      const answered = page.waitForResponse(/releases\/latest/);
      await page.goto('/');
      await answered;
      await expect(page.getByTestId('release')).toBeVisible();
      const note = await page.getByTestId('demo-note').boundingBox();
      expect(note!.x + note!.width / 2).toBeCloseTo(viewport.width / 2, 0);
    }
  });
}

for (const [width, viewport] of Object.entries(WIDTHS)) {
  test(`on a ${width}, the bar's keys line up with the app's GitHub and History keys under them`, async ({ page }) => {
    await offline(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await siteReady(page);
    const demo = page.frameLocator('iframe[title="Boomerang demo"]');
    const github = await demo.locator('#gh').boundingBox();
    const history = await demo.locator('#menu').boundingBox();
    const self = await page.getByRole('link', { name: 'Self-host with Docker' }).boundingBox();
    const release = await page.getByTestId('release').boundingBox();
    expect(self!.x).toBeCloseTo(github!.x, 0);
    expect(release!.x + release!.width).toBeCloseTo(history!.x + history!.width, 0);
  });
}
