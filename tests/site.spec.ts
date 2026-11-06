import { expect, test } from '@playwright/test';
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
  await expect(page.getByTestId('demo-note')).toBeVisible();
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
  await expect(page.getByTestId('demo-note')).toBeVisible();
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
  await expect(key).toHaveText('Releases');
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

for (const answer of [{}, { status: 404 }]) {
  test(`on a phone, the note and the keys keep clear of each other ${answer.status ? 'before there is a release' : 'with a version in the key'}`, async ({ page }) => {
    await offline(page, answer);
    const answered = page.waitForResponse(/releases\/latest/);
    await page.setViewportSize(WIDTHS.phone);
    await page.goto('/');
    await answered;
    await expect(page.getByRole('link', { name: 'Self-host with Docker' })).toBeVisible();
    await expect(page.getByTestId(answer.status ? 'release' : 'release-tag')).toBeVisible();
    const note = await page.getByTestId('demo-note').locator('span').nth(1).boundingBox();
    const keys = await page.locator('header nav').boundingBox();
    expect(note!.x + note!.width + 12).toBeLessThanOrEqual(keys!.x);
    expect(keys!.x + keys!.width).toBeLessThanOrEqual(WIDTHS.phone.width);
  });
}

test('the demo note stays muted until a test runs, and quiets again after it', async ({ page }) => {
  await offline(page);
  await page.goto('/');
  const note = page.getByTestId('demo-note');
  const demo = page.frameLocator('iframe[title="Boomerang demo"]');
  await demo.getByTestId('start').click();
  await expect(note).toHaveAttribute('data-running', 'true');
  await expect(demo.getByTestId('result')).toBeVisible({ timeout: 20_000 });
  await demo.getByTestId('new-run').click();
  await expect(note).toHaveAttribute('data-running', 'false');
});
