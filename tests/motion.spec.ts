import { expect, type Page } from '@playwright/test';
import { WIDTHS, test } from './helpers';

// Reduced motion keeps the scene alive: the boomerangs
// still fly, and only the scene's shake and the interface's own movement go.
// The scene is compared with the interface hidden, so only it is photographed.

async function hideInterface(page: Page): Promise<void> {
  // Everything over the canvas, children included, since the page sets their visibility as they come and go.
  await page.addStyleTag({ content: '#app > :not(canvas), #app > :not(canvas) * { visibility: hidden !important; }' });
}

async function sceneMoves(page: Page): Promise<boolean> {
  await page.goto('/');
  await page.waitForTimeout(800);
  await hideInterface(page);
  const first = await page.screenshot();
  await page.waitForTimeout(700);
  return !(await page.screenshot()).equals(first);
}

/** The History key's own transform while it is held down. */
async function pressedTransform(page: Page): Promise<string> {
  await page.goto('/');
  const key = page.getByTestId('history-toggle');
  await key.hover();
  await page.mouse.down();
  // Past the key's 160 ms ease into its pressed state.
  await page.waitForTimeout(250);
  const transform = await key.evaluate((n) => getComputedStyle(n).transform);
  await page.mouse.up();
  return transform;
}

test.use({ viewport: WIDTHS.phone });

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('keeps the idle scene moving', async ({ page }) => {
    expect(await sceneMoves(page)).toBe(true);
  });

  test('a pressed key darkens without giving', async ({ page }) => {
    expect(await pressedTransform(page)).toBe('none');
  });
});

test('a pressed key gives a little', async ({ page }) => {
  expect(await pressedTransform(page)).toMatch(/^matrix\(0\.97,/);
});

test('Start never gives under a press: the press shows in light alone', async ({ page }) => {
  await page.goto('/');
  const start = page.getByTestId('start');
  await start.hover();
  await page.mouse.down();
  await page.waitForTimeout(200);
  expect(await start.evaluate((n) => getComputedStyle(n).transform)).toBe('none');
  await page.mouse.up();
});
