import { expect, type Locator, type Page } from '@playwright/test';
import {
  ADAPTIVE_RUN_LIMIT_MS,
  WIDTHS,
  closeHistory,
  expectNoHorizontalOverflow,
  fixtureHistory,
  longHistory,
  openHistory,
  runTest,
  seedHistory,
  throttle,
  storedRuns,
  test,
} from './helpers';

test('a finished run is saved with its time, mode and device, and survives a reload', async ({ page }) => {
  await throttle(page);
  await page.goto('/');
  const before = Date.now();
  await runTest(page, 'adaptive');

  await page.reload();
  await openHistory(page);
  const items = page.getByTestId('history-item');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toHaveAttribute('data-mode', 'adaptive');

  const datetime = await items.first().getByTestId('history-time').getAttribute('datetime');
  expect(datetime).not.toBeNull();
  const startedAt = Date.parse(datetime!);
  expect(Number.isNaN(startedAt)).toBe(false);
  expect(Math.abs(startedAt - before)).toBeLessThan(60_000);

  // Headless Chromium on a desktop: the device is read from the browser, and kept with the run.
  const saved = storedRuns(page)[0];
  expect(saved.device).toEqual({ os: expect.any(String), form: 'Desktop', browser: 'Chrome' });
});

test('a new run lands first, above the saved ones', async ({ page }) => {
  await throttle(page);
  await seedHistory(page, fixtureHistory());
  await page.goto('/');
  await openHistory(page);
  await expect(page.getByTestId('history-item')).toHaveCount(3);
  await closeHistory(page);

  const before = Date.now();
  await runTest(page, 'adaptive');
  await page.getByTestId('new-run').click();
  await openHistory(page);

  const items = page.getByTestId('history-item');
  await expect(items).toHaveCount(4);
  const times = await items
    .getByTestId('history-time')
    .evaluateAll((els) => els.map((el) => Date.parse(el.getAttribute('datetime')!)));
  expect(times[0]).toBeGreaterThanOrEqual(before - 1000);
  expect(times).toEqual([...times].sort((a, b) => b - a));
});

test('the list shows ten runs at a time, newest first', async ({ page }) => {
  await seedHistory(page, longHistory(25));
  await page.goto('/');
  await openHistory(page);
  const items = page.getByTestId('history-item');
  const more = page.getByTestId('history-more');
  await expect(items).toHaveCount(10);
  await more.click();
  await expect(items).toHaveCount(20);
  await more.click();
  await expect(items).toHaveCount(25);
  await expect(more).toBeHidden();
  const times = await items.getByTestId('history-time').evaluateAll((els) => els.map((el) => Date.parse(el.getAttribute('datetime')!)));
  expect(times).toEqual([...times].sort((a, b) => b - a));
});

test('clearing asks first, then removes every run for good', async ({ page }) => {
  await seedHistory(page, fixtureHistory());
  await page.goto('/');
  await openHistory(page);
  const items = page.getByTestId('history-item');
  await expect(items).toHaveCount(3);
  // Clearing is the only way to delete: a line is one key, which reopens its run.
  await expect(items.first().getByRole('button')).toHaveCount(1);

  await page.getByTestId('history-clear').click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(items).toHaveCount(3);

  await page.getByTestId('history-clear').click();
  await page.getByTestId('history-clear-confirm').click();
  await expect(items).toHaveCount(0);
  await expect(page.getByText('No tests yet')).toBeVisible();
  await expect.poll(() => storedRuns(page)).toEqual([]);

  await page.reload();
  await openHistory(page);
  await expect(page.getByText('No tests yet')).toBeVisible();
  expect(storedRuns(page)).toEqual([]);
});

test('back from a reopened run returns to the list as it was left', async ({ page }) => {
  await seedHistory(page, longHistory(25));
  await page.goto('/');
  await openHistory(page);
  const items = page.getByTestId('history-item');
  await page.getByTestId('history-more').click();
  await expect(items).toHaveCount(20);

  // Scroll down the list and open a run from there.
  const scroller = page.locator('#histScroll');
  await scroller.evaluate((el) => el.scrollTo(0, 240));
  const scrolled = await scroller.evaluate((el) => el.scrollTop);
  expect(scrolled).toBeGreaterThan(100);
  const row = items.nth(12);
  await row.click();
  await expect(page.getByTestId('history-details')).toBeVisible();
  // A reopened run keeps the list's address.
  await expect(page).toHaveURL(/\/history$/);

  // The browser's back button: the same list, the same rows loaded, the same scroll.
  await page.goBack();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByTestId('history-details')).toBeHidden();
  await expect(items.first()).toBeVisible();
  await expect(items).toHaveCount(20);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(scrolled);

  // Back once more leaves History for the idle screen.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('start')).toBeEnabled();
  await expect(page.getByTestId('history')).toBeHidden();

  // Forward steps back in: the list, then the run.
  await page.goForward();
  await expect(page).toHaveURL(/\/history$/);
  await expect(items.first()).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId('history-details')).toBeVisible();
});

test('a visit straight to /history, or a reload there, opens the list', async ({ page }) => {
  await seedHistory(page, fixtureHistory());
  await page.goto('/history');
  const items = page.getByTestId('history-item');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toBeVisible();

  // A reload on a reopened run comes back to the list.
  await items.first().click();
  await expect(page.getByTestId('history-details')).toBeVisible();
  await page.reload();
  await expect(items.first()).toBeVisible();
  await expect(page.getByTestId('history-details')).toBeHidden();

  // With no home under it, the History key goes home in its place.
  await closeHistory(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('history')).toBeHidden();
});

test('a load at /history draws the list in place from its first frame, with no Start before it', async ({ page }) => {
  await seedHistory(page, fixtureHistory());
  // Every frame from the first, whether Start was drawn and how far the rows were up.
  await page.addInitScript(() => {
    const seen: { start: boolean; row: string }[] = [];
    (window as unknown as { seen: typeof seen }).seen = seen;
    const look = () => {
      const wrap = document.getElementById('startWrap');
      const row = document.querySelector<HTMLElement>('[data-testid=history-item]');
      if (wrap) seen.push({ start: getComputedStyle(wrap).visibility === 'visible', row: row ? getComputedStyle(row).opacity : '' });
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await page.goto('/history');
  await expect(page.getByTestId('history-item').first()).toBeVisible();
  await page.waitForTimeout(500);
  const seen = await page.evaluate(() => (window as unknown as { seen: { start: boolean; row: string }[] }).seen);
  expect(seen.length).toBeGreaterThan(5);
  expect(seen.filter((f) => f.start)).toEqual([]);
  expect(seen.filter((f) => f.row !== '1')).toEqual([]);
});

test('the logo is a link home, so a modified click opens it in a new tab and leaves this one be', async ({ page, context }) => {
  await seedHistory(page, fixtureHistory());
  await page.goto('/history');
  const logo = page.locator('#logo');
  await expect(logo).toHaveAttribute('href', '/');
  await expect(page.getByTestId('history-item').first()).toBeVisible();

  const opened = context.waitForEvent('page');
  await logo.click({ modifiers: ['ControlOrMeta'] });
  const tab = await opened;
  await tab.waitForLoadState();
  expect(new URL(tab.url()).pathname).toBe('/');
  await tab.close();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByTestId('history-item').first()).toBeVisible();

  // A plain click goes home in place, as before.
  await logo.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('history')).toBeHidden();
});

test('the History key is a link to /history, so a modified click opens it in a new tab and leaves this one be', async ({ page, context }) => {
  await seedHistory(page, fixtureHistory());
  await page.goto('/');
  const key = page.getByTestId('history-toggle');
  await expect(key).toHaveAttribute('href', '/history');
  await expect(page.getByTestId('start')).toBeEnabled();

  const opened = context.waitForEvent('page');
  await key.click({ modifiers: ['ControlOrMeta'] });
  const tab = await opened;
  await tab.waitForLoadState();
  expect(new URL(tab.url()).pathname).toBe('/history');
  await expect(tab.getByTestId('history-item').first()).toBeVisible();
  await tab.close();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('history')).toBeHidden();

  // A plain click opens History in place, and the key reads as the page you're on.
  await key.click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByTestId('history-item').first()).toBeVisible();
  await expect(key).toHaveAttribute('aria-current', 'page');
  await closeHistory(page);
  await expect(key).not.toHaveAttribute('aria-current');
});

test('the History key is a disabled link while a run is going', async ({ page }) => {
  await throttle(page);
  await page.goto('/');
  const key = page.getByTestId('history-toggle');
  await page.getByTestId('mode-adaptive').click();
  await page.getByTestId('start').click();
  await expect(key).toBeDisabled();
  await expect(key).toHaveRole('link');
  await expect(key).not.toHaveAttribute('href');

  await expect(page.getByTestId('result')).toBeVisible({ timeout: ADAPTIVE_RUN_LIMIT_MS });
  await expect(key).toBeEnabled();
  await expect(key).toHaveAttribute('href', '/history');
});

/** The table and its keys, from the top of the heads to the foot of the keys, inside the layer that runs from under the top bar to the foot of the page. */
async function block(page: Page): Promise<{ above: number; below: number; top: number }> {
  return page.evaluate(() => {
    const box = (id: string) => document.getElementById(id)!.getBoundingClientRect();
    const layer = box('hist');
    const top = box('histScroll').top;
    return { above: top - layer.top, below: layer.bottom - box('histFoot').bottom, top };
  });
}

/** The page has finished moving History in: the layer's last step, the keys under the table, is at rest. */
async function settled(page: Page): Promise<void> {
  // Until the page first draws the layer, the keys carry no translate at all.
  await expect
    .poll(() => page.locator('#histFoot').evaluate((n) => [getComputedStyle(n).opacity, getComputedStyle(n).translate]))
    .toEqual(['1', '0px']);
}

test('on a wide screen History opens with its table centred under the top bar', async ({ page }) => {
  await page.setViewportSize(WIDTHS.desktop);
  await seedHistory(page, fixtureHistory());
  await page.goto('/');
  await openHistory(page);
  await expect(page.getByTestId('history-item')).toHaveCount(3);
  await settled(page);
  const { above, below } = await block(page);
  expect(above).toBeGreaterThan(100);
  expect(above).toBeCloseTo(below, 0);
});

test("Load more grows the list downwards without moving what's on screen", async ({ page }) => {
  // Tall enough that the first ten runs sit centred, short enough that twenty run past the foot.
  await page.setViewportSize({ width: 1280, height: 1100 });
  await seedHistory(page, longHistory(25));
  await page.goto('/');
  await openHistory(page);
  const items = page.getByTestId('history-item');
  await expect(items).toHaveCount(10);
  await settled(page);
  const tops = () => page.locator('#histHead, [data-testid=history-item]').evaluateAll((els) => els.map((n) => n.getBoundingClientRect().top));
  const before = await tops();
  const { above, below, top } = await block(page);
  expect(above).toBeGreaterThan(100);
  expect(above).toBeCloseTo(below, 0);

  await page.getByTestId('history-more').click();
  await expect(items).toHaveCount(20);
  const after = await tops();
  expect(after.slice(0, before.length)).toEqual(before);
  expect((await block(page)).top).toBe(top);
  // The new rows land under the last, and the table now scrolls rather than climbing up the page.
  expect(after[before.length]).toBeGreaterThan(before.at(-1)!);
  expect(await page.locator('#histScroll').evaluate((n) => n.scrollHeight > n.clientHeight)).toBe(true);
});

/** The computed values of these style properties, as the page draws the element. */
const computed = (n: Locator, keys: string[]) =>
  n.evaluate((el, keys) => {
    const s = getComputedStyle(el);
    return Object.fromEntries(keys.map((k) => [k, s.getPropertyValue(k)]));
  }, keys);
const TYPE = ['font-family', 'font-stretch', 'font-size', 'font-weight', 'text-transform', 'letter-spacing'];

/**
 * History's type on each screen: the table's heads, the other small labels
 * (a reopened run's, and No tests yet), and the values (and the empty state's
 * note). A phone draws the table's heads a size under the other labels.
 */
const SIZES = { phone: { head: '11px', label: '12px', value: '16px' }, desktop: { head: '14px', label: '14px', value: '21px' } } as const;

/** The same computed type at another size: the tracking is set in em, so it scales with it. */
const resized = (type: Record<string, string>, size: string): Record<string, string> => {
  const by = parseFloat(size) / parseFloat(type['font-size']);
  return { ...type, 'font-size': size, 'letter-spacing': `${+(parseFloat(type['letter-spacing']) * by).toFixed(2)}px` };
};

for (const [width, viewport] of Object.entries(WIDTHS)) {
  test(`History's heads and values are set as a reopened run's labels and values (${width})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedHistory(page, fixtureHistory());
    await page.goto('/');
    await openHistory(page);
    await expect(page.getByTestId('history-item')).toHaveCount(3);
    const head = await computed(page.locator('#histHead > span').first(), [...TYPE, 'color']);
    const value = await computed(page.locator('[data-testid=history-item] .run > span').first(), TYPE);
    const sizes = SIZES[width as keyof typeof SIZES];
    expect(head['font-size']).toBe(sizes.head);
    expect(value['font-size']).toBe(sizes.value);
    const label = resized(head, sizes.label);
    // Numbers keep their width, so a figure never shifts its neighbours.
    expect(await computed(page.locator('[data-testid=history-item] .run b').first(), ['font-variant-numeric'])).toEqual({ 'font-variant-numeric': 'tabular-nums' });

    await page.getByTestId('history-item').first().click();
    await expect(page.getByTestId('history-details')).toBeVisible();
    expect(await computed(page.locator('#where dt').first(), [...TYPE, 'color'])).toEqual(label);
    expect(await computed(page.locator('#where dd').first(), TYPE)).toEqual(value);
    // On a phone every small grey label but the table's heads is one size: the stats' and the charts' names too.
    if (width === 'phone') {
      const type = Object.fromEntries(TYPE.map((k) => [k, label[k]]));
      for (const label of await page.locator('.stats dt, #charts figcaption').all()) expect(await computed(label, TYPE)).toEqual(type);
    }
  });

  test(`the empty state reads as a small label over a row's value (${width})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedHistory(page, fixtureHistory());
    await page.goto('/');
    await openHistory(page);
    await expect(page.getByTestId('history-item')).toHaveCount(3);
    const head = await computed(page.locator('#histHead > span').first(), [...TYPE, 'color']);
    const value = await computed(page.locator('[data-testid=history-item] .run > span').first(), TYPE);

    await page.getByTestId('history-clear').click();
    await page.getByTestId('history-clear-confirm').click();
    const title = page.getByText('No tests yet');
    await expect(title).toBeVisible();
    expect(await computed(title, [...TYPE, 'color'])).toEqual(resized(head, SIZES[width as keyof typeof SIZES].label));
    expect(await computed(page.getByText('Finished tests are kept on this server'), TYPE)).toEqual(value);
  });
}

test.describe('phone', () => {
  test.use({ viewport: WIDTHS.phone });

  test('the table scrolls sideways inside History without widening the page', async ({ page }) => {
    await seedHistory(page, fixtureHistory());
    await page.goto('/');
    await openHistory(page);
    await expect(page.getByTestId('history-item')).toHaveCount(3);
    const scroller = page.locator('#histScroll');
    const { scrollWidth, clientWidth } = await scroller.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    await scroller.evaluate((el) => el.scrollTo(el.scrollWidth, 0));
    expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    // The page itself has not moved.
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
    await expectNoHorizontalOverflow(page);
  });

  test("the edge-to-edge table starts and ends its text on the page's 34px edge", async ({ page }) => {
    await seedHistory(page, fixtureHistory());
    await page.goto('/');
    await openHistory(page);
    await expect(page.getByTestId('history-item').first()).toBeVisible();
    // The page's column, which the logo's keys and Clear history line up to.
    const column = await page.getByTestId('history-clear').evaluate((n) => n.getBoundingClientRect().left);
    expect(column).toBeCloseTo(34, 0);
    const { left, right } = await lineInsets(page);
    expect(left).toBeCloseTo(column, 0);
    expect(right).toBeCloseTo(column, 0);
  });

  test('with a short list, Clear history sits where the bottom key does on the start screen', async ({ page }) => {
    await seedHistory(page, fixtureHistory());
    await page.goto('/');
    await expect(page.getByTestId('start')).toBeEnabled();
    const pill = await rect(page.locator('#dock'));
    await openHistory(page);
    await expect(page.getByTestId('history-item')).toHaveCount(3);
    await settled(page);
    expectSameBox(await rect(page.getByTestId('history-clear')), pill);
  });

  test('Load more and Clear history stay at the foot of the screen while the rows scroll above them', async ({ page }) => {
    await seedHistory(page, longHistory(25));
    await page.goto('/');
    await expect(page.getByTestId('start')).toBeEnabled();
    const pill = await rect(page.locator('#dock'));
    await openHistory(page);
    const items = page.getByTestId('history-item');
    await expect(items).toHaveCount(10);
    await settled(page);
    const more = page.getByTestId('history-more');
    const clear = page.getByTestId('history-clear');
    // Clear history takes the bottom key's place, Load more stacked 12px over it.
    const clearAt = await rect(clear);
    expectSameBox(clearAt, pill);
    const moreAt = await rect(more);
    expect(moreAt.bottom).toBeCloseTo(pill.top - 12, 0);

    // Load more adds rows above the keys, and neither key moves.
    await more.click();
    await expect(items).toHaveCount(20);
    expect(await rect(clear)).toEqual(clearAt);
    expect(await rect(more)).toEqual(moreAt);

    // The rows scroll under the keys' edge, and the last comes fully clear of them.
    const scroller = page.locator('#histScroll');
    expect(await scroller.evaluate((n) => n.scrollHeight > n.clientHeight)).toBe(true);
    expect((await rect(scroller)).bottom).toBeLessThanOrEqual(moreAt.top);
    await scroller.evaluate((n) => n.scrollTo(0, n.scrollHeight));
    expect((await rect(items.last())).bottom).toBeLessThanOrEqual((await rect(scroller)).bottom);
    expect(await rect(more)).toEqual(moreAt);
    expect(await rect(clear)).toEqual(clearAt);
  });
});

/** Where an element is drawn on screen. */
const rect = (n: Locator) =>
  n.evaluate((el) => {
    const { left, top, right, bottom } = el.getBoundingClientRect();
    return { left, top, right, bottom };
  });

/** Two boxes in the same place, to the nearest pixel. */
function expectSameBox(a: { left: number; top: number; right: number; bottom: number }, b: typeof a): void {
  for (const k of ['left', 'top', 'right', 'bottom'] as const) expect(a[k], k).toBeCloseTo(b[k], 0);
}

/**
 * Where each line's text starts and ends, from the line's own edges (the
 * hairline, and the wash under the cursor): When's text on the left, the
 * last column's on the right, at the widest any line has it.
 */
async function lineInsets(page: Page): Promise<{ left: number; right: number }> {
  return page.locator('#histList').evaluate((list) => {
    const rows = [...list.querySelectorAll('.row')];
    const ink = (n: Element) => {
      const range = document.createRange();
      range.selectNodeContents(n);
      return range.getBoundingClientRect();
    };
    const line = rows[0].getBoundingClientRect();
    const cells = rows.map((row) => row.querySelector('.run')!);
    return {
      left: Math.min(...cells.map((c) => ink(c.firstElementChild!).left)) - line.left,
      right: line.right - Math.max(...cells.map((c) => ink(c.lastElementChild!).right)),
    };
  });
}

test("a line's text sits as far in from both its ends as a key's label does", async ({ page }) => {
  await seedHistory(page, fixtureHistory());
  await page.goto('/');
  await openHistory(page);
  await expect(page.getByTestId('history-item').first()).toBeVisible();
  const clear = page.getByTestId('history-clear');
  const label = await clear.locator('span').evaluate((n) => {
    const key = n.parentElement!.getBoundingClientRect();
    return key.right - n.getBoundingClientRect().right;
  });
  const { left, right } = await lineInsets(page);
  expect(left).toBeCloseTo(label, 0);
  expect(right).toBeCloseTo(label, 0);
});
