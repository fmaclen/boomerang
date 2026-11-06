import { expect } from '@playwright/test';
import { WIDTHS, openHistory, test } from './helpers';

// The tab icons follow the browser's colour scheme, so every ink in them
// reads on a light tab strip as well as a dark one. Each scheme's icons are
// drawn on a strip of that scheme, beside the home-screen icon and the page's
// own logo, to screenshots/mark-<scheme>.png.

/** Chrome's tab strips: the light one, darker than its white tabs, and the dark one. */
const STRIPS = { light: '#dee1e6', dark: '#202124' } as const;

for (const scheme of ['light', 'dark'] as const) {
  test(`the tab icons read on a ${scheme} tab strip`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const tabs = page.locator('link[rel=icon]');
    await expect(tabs).toHaveCount(2);
    const [small, large] = await Promise.all([0, 1].map((i) => tabs.nth(i).getAttribute('href')));
    await expect(page.locator('link[rel=icon]').nth(1)).toHaveAttribute('sizes', '32x32');
    const strip = STRIPS[scheme];

    for (const href of [small!, large!]) {
      // Every ink the icon draws, from its solid pixels, and how each reads on the strip.
      const inks = await page.evaluate(
        async ({ href, strip }) => {
          const img = new Image();
          img.src = href;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = c.height = 128;
          const g = c.getContext('2d')!;
          g.drawImage(img, 0, 0, 128, 128);
          const d = g.getImageData(0, 0, 128, 128).data;
          const lum = (r: number, gr: number, b: number) =>
            [r, gr, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
          const bg = lum(...([1, 3, 5].map((i) => parseInt(strip.slice(i, i + 2), 16)) as [number, number, number]));
          const seen = new Map<string, number>();
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 255) continue;
            const key = `${d[i]},${d[i + 1]},${d[i + 2]}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
          }
          return [...seen].filter(([, n]) => n >= 20).map(([key]) => {
            const l = lum(...(key.split(',').map(Number) as [number, number, number]));
            return { ink: key, contrast: (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05) };
          });
        },
        { href, strip },
      );
      // The oo and its two arcs, each at 3:1 or better.
      expect(inks).toHaveLength(3);
      for (const { contrast } of inks) expect(contrast).toBeGreaterThanOrEqual(3);
    }

    // The icons as a tab, at 32 px and on the home screen, beside the page's own logo.
    const home = page.locator('link[rel=apple-touch-icon]');
    await expect(home).toHaveAttribute('href', /^data:image\/png;base64,/);
    const tile = await home.getAttribute('href');
    const logo = (await page.locator('#logo').screenshot()).toString('base64');
    await page.setContent(`
      <body style="margin:0;background:${strip};font:13px system-ui;color:${scheme === 'light' ? '#202124' : '#e8eaed'}">
        <div style="display:inline-flex;align-items:center;gap:28px;padding:16px 20px">
          <span style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:${scheme === 'light' ? '#fff' : '#35363a'}"><img src="${small}" width="16" height="16">Boomerang</span>
          <img src="${large}" width="32" height="32">
          <img src="${tile}" width="90" height="90" style="border-radius:20px">
          <img src="data:image/png;base64,${logo}" style="padding:12px 16px;background:#080d0c;border-radius:8px">
        </div>
      </body>`);
    await page.locator('div').first().screenshot({ path: `screenshots/mark-${scheme}.png` });
  });
}

test.describe('the logo', () => {
  test.use({ viewport: WIDTHS.desktop });

  test('throws its arcs under a resting cursor, and moves nothing round it', async ({ page }) => {
    await page.goto('/');
    const logo = page.locator('#logo');
    const mark = logo.locator('svg');
    const before = await logo.boundingBox();
    await logo.hover();
    await expect(mark).toHaveAttribute('data-throw');
    expect(await logo.boundingBox()).toEqual(before);
    // The orange arc and its echoes, then the lime's: the lime throws first.
    const delays = await mark.evaluate((m) => m.getAnimations({ subtree: true }).map((a) => (a.effect as KeyframeEffect).getComputedTiming().delay));
    expect(delays).toEqual([90, 90, 90, 0, 0, 0]);
    // The throw finishes by itself, in about 0.7 s.
    await expect(mark).not.toHaveAttribute('data-throw', { timeout: 1000 });
    expect(await logo.boundingBox()).toEqual(before);
  });

  test('is named Boomerang and goes home', async ({ page }) => {
    await page.goto('/');
    await openHistory(page);
    await expect(page).toHaveURL(/\/history$/);
    await page.getByRole('link', { name: 'Boomerang', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('start')).toBeEnabled();
  });

  test('stays still with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('#logo').hover();
    await page.waitForTimeout(100);
    await expect(page.locator('#logo svg')).not.toHaveAttribute('data-throw');
  });
});
