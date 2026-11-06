import { test } from '@playwright/test';
import { WIDTHS, expectNoHorizontalOverflow, screenshot } from './helpers';
import { offline, siteReady } from './site';

// The landing page in Safari's engine at the phone's size, as tests/iphone.spec.ts
// draws the app. Runs only in the `site-webkit` project.
test.use({ viewport: WIDTHS.phone });

test('the landing page on an iPhone', async ({ page }) => {
  await offline(page);
  await page.goto('/');
  await page.getByTestId('release-tag').waitFor();
  await siteReady(page);
  await screenshot(page, 'site', 'iphone');
  await expectNoHorizontalOverflow(page);
});
