import type { Page } from '@playwright/test';

// What the landing page tests share: GitHub and Plausible stubbed out so a run
// is the same every time and never leaves the machine.

const RELEASE_API = 'https://api.github.com/repos/fmaclen/boomerang/releases/latest';

/** Answers the releases API with a release, or with `status` alone, and drops Plausible's request. */
export async function offline(page: Page, answer: { status?: number } = {}): Promise<void> {
  await page.route('https://plausible.fernando.is/**', (route) => route.abort());
  await page.route(RELEASE_API, (route) =>
    answer.status
      ? route.fulfill({ status: answer.status, json: { message: 'Not Found' } })
      : route.fulfill({
          json: {
            tag_name: 'v1.2.0',
            html_url: 'https://github.com/fmaclen/boomerang/releases/tag/v1.2.0',
          },
        }),
  );
}

/** Waits for the framed demo to draw Start and for both documents' fonts. The frame loads lazily, so it is scrolled to first. */
export async function siteReady(page: Page): Promise<void> {
  const frame = page.locator('iframe[title="Boomerang demo"]');
  await frame.scrollIntoViewIfNeeded();
  const demo = frame.contentFrame();
  await demo.getByTestId('start').waitFor();
  await demo.locator('body').evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(() => document.fonts.ready.then(() => window.scrollTo(0, 0)));
  // Let the scene settle into its idle drift.
  await page.waitForTimeout(1_000);
}
