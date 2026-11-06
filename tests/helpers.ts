import { test as base, devices, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { Formatted } from '../src/lib/engine/format';
import { parseResult } from '../src/lib/engine/stored';
import type { Device, HistoryMode, Mode, Result, Sample, Transfer } from '../src/lib/engine/types';

/**
 * Each test's own box store. The page keeps its runs on the box, and every
 * test shares one preview server; so `test` answers /runs for its browser
 * context from a list held here, the way the box's store answers it, and
 * runs from one test never show in another's History.
 */
const stores = new WeakMap<BrowserContext, { runs: Result[] }>();

export const test = base.extend<{ store: { runs: Result[] } }>({
  store: [
    async ({ context }, use) => {
      const store = { runs: [] as Result[] };
      stores.set(context, store);
      // A glob, not a function, so the browser's other requests are not each handed to the test to match.
      await context.route(
        '**/runs',
        async (route) => {
          const request = route.request();
          if (request.method() === 'GET') return route.fulfill({ json: store.runs, headers: { 'Cache-Control': 'no-store' } });
          if (request.method() === 'DELETE') {
            store.runs = [];
            return route.fulfill({ status: 204 });
          }
          if (request.method() !== 'POST') return route.fulfill({ status: 405 });
          let body: unknown;
          try {
            body = request.postDataJSON();
          } catch {
            body = undefined;
          }
          const run = parseResult(body);
          if (!run) return route.fulfill({ status: 400 });
          if (!store.runs.some((r) => r.id === run.id)) store.runs = [run, ...store.runs].sort((a, b) => b.startedAt - a.startedAt);
          return route.fulfill({ status: 201 });
        },
      );
      await use(store);
    },
    { auto: true },
  ],
});

function storeOf(page: Page): { runs: Result[] } {
  const store = stores.get(page.context());
  if (!store) throw new Error('this page has no store of its own; import `test` from ./helpers');
  return store;
}

/** The rates Chromium is throttled to; the engine has to land within TOLERANCE of them. */
export const THROTTLE = { downloadMbps: 50, uploadMbps: 10, latencyMs: 20 };
export const TOLERANCE = 0.15;
/**
 * A quick run on the page's own beats: 5.4 s of ping, up to five seconds a
 * direction, 1.6 s between them, so its result is in by about seventeen
 * seconds and formed 1.6 s later.
 */
export const ADAPTIVE_RUN_LIMIT_MS = 20_000;
export const FIXED_RUN_LIMIT_MS = 90_000;

// The phone is what Safari on an iPhone 17 shows a visitor: the screen minus
// the browser's bars, not the 390 x 844 of the whole screen.
export const WIDTHS = {
  phone: devices['iPhone 17'].viewport,
  desktop: { width: 1280, height: 800 },
} as const;

export const RESULT_FIELDS = [
  'download',
  'upload',
  'latency-idle',
  'jitter',
  'bytes',
] as const;
export type ResultField = (typeof RESULT_FIELDS)[number];

export async function throttle(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: THROTTLE.latencyMs,
    downloadThroughput: (THROTTLE.downloadMbps * 1e6) / 8,
    uploadThroughput: (THROTTLE.uploadMbps * 1e6) / 8,
  });
}

/** What each unit the engine's formatters write is worth in Mbps (rates) or bytes (sizes); ms stays ms. */
const UNIT_SCALE: Record<string, number> = {
  gbps: 1e3,
  mbps: 1,
  tb: 1e12,
  gb: 1e9,
  mb: 1e6,
  ms: 1,
};

/**
 * Reads the first number in the text and the unit right after it, and returns
 * a rate in Mbps or a size in bytes whatever unit is shown. Case is ignored,
 * since a page may uppercase its units with CSS.
 */
export function parseQuantity(text: string): number {
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*(gbps|mbps|tb|gb|mb|ms)?(?![a-z])/i);
  if (!match) throw new Error(`no number in ${JSON.stringify(text)}`);
  const scale = match[2] ? UNIT_SCALE[match[2].toLowerCase()] : 1;
  return Number(match[1]) * scale;
}

export async function readNumber(locator: Locator): Promise<number> {
  return parseQuantity(await locator.innerText());
}

/** Passes when the element shows exactly the formatter's value followed by its unit, spaced or styled apart however the page likes. */
export async function expectFormatted(locator: Locator, formatted: Formatted): Promise<void> {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const shown = new RegExp(`(?<![\\d.])${escape(formatted.value)}\\s*${escape(formatted.unit)}(?![a-z])`, 'i');
  await expect(locator, `expected ${formatted.text}`).toHaveText(shown, { useInnerText: true });
}

/** Reads every result field once the result has settled, so a page that counts its numbers up is read at the end. */
export async function readResult(page: Page): Promise<Record<ResultField, number>> {
  await waitForSettled(page);
  const out = {} as Record<ResultField, number>;
  for (const field of RESULT_FIELDS) out[field] = await readNumber(page.getByTestId(`result-${field}`));
  return out;
}

export function expectWithinTolerance(actual: number, target: number): void {
  expect(actual).toBeGreaterThanOrEqual(target * (1 - TOLERANCE));
  expect(actual).toBeLessThanOrEqual(target * (1 + TOLERANCE));
}

/** Picks the mode, starts, waits for the result. Returns the milliseconds from clicking start to the result appearing. */
export async function runTest(page: Page, mode: Mode, limitMs = ADAPTIVE_RUN_LIMIT_MS): Promise<number> {
  await page.getByTestId(`mode-${mode}`).click();
  const started = Date.now();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: limitMs });
  return Date.now() - started;
}

/** Rewrites the boomerang-history meta tag in the served HTML, so both modes are covered against any server. */
export async function setHistoryMode(page: Page, mode: HistoryMode): Promise<void> {
  await page.route(
    (url) => url.pathname === '/' || url.pathname === '/index.html',
    async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace(
        /(<meta name="boomerang-history" content=")[^"]*(")/,
        `$1${mode}$2`,
      );
      await route.fulfill({ response, body: html });
    },
  );
}

/**
 * Waits for the page to finish loading itself: Start drawn and its fonts in.
 * A page built in the browser can still be fetching its own assets after the
 * HTML's load event, which is where page.goto returns.
 */
export async function pageReady(page: Page): Promise<void> {
  await page.getByTestId('start').waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * History may sit behind a control on the idle screen; when the page has one,
 * open it first. A page built in the browser may not have drawn the control
 * when page.goto returns, so this waits for Start, which every page has.
 */
export async function openHistory(page: Page): Promise<void> {
  await page.getByTestId('start').waitFor({ state: 'attached' });
  const toggle = page.getByTestId('history-toggle');
  if (await toggle.count()) await toggle.first().click();
}

/** History is a layer over idle on this page: the same key closes it, and Start is back once it has. */
export async function closeHistory(page: Page): Promise<void> {
  await page.getByTestId('history-toggle').click();
  await expect(page.getByTestId('start')).toBeEnabled();
}

/** Puts fixture results in this test's box store before the page loads. Seeds it once, so reloads keep later changes. */
export async function seedHistory(page: Page, results: Result[]): Promise<void> {
  storeOf(page).runs = [...results];
}

/** The runs this test's box store holds, newest first, as the page saved them. */
export function storedRuns(page: Page): Result[] {
  return storeOf(page).runs;
}

const PHONE: Device = { os: 'iPhone', form: 'Mobile', browser: 'Safari' };
const MAC: Device = { os: 'macOS', form: 'Desktop', browser: 'Brave' };
const LINUX: Device = { os: 'Linux', form: 'Desktop', browser: 'Firefox' };

/**
 * Two adaptive runs and one fixed run of thirty seconds a direction, at
 * distinct times, newest first. The oldest has four-digit rates and was saved
 * when a run kept one sample a second; the others keep ten.
 */
export function fixtureHistory(now = Date.now()): Result[] {
  const hour = 3600_000;
  return [
    fixtureResult('fixture-1', now - 2 * hour, 'adaptive', 48.2, 9.6, 3, PHONE),
    fixtureResult('fixture-2', now - 26 * hour, 'fixed', 93.1, 41.8, 30, MAC),
    fixtureResult('fixture-3', now - 72 * hour, 'adaptive', 2412.6, 1087.3, 4, LINUX, 1),
  ];
}

/** n runs a day apart, newest first, enough to page through. */
export function longHistory(n: number, now = Date.now()): Result[] {
  const devices = [PHONE, MAC, LINUX];
  return Array.from({ length: n }, (_, i) =>
    fixtureResult(`run-${i + 1}`, now - (i + 1) * 86_400_000, i % 3 ? 'adaptive' : 'fixed', 40 + 7 * i, 8 + i, i % 3 ? 4 : 30, devices[i % 3]),
  );
}

function fixtureResult(
  id: string,
  startedAt: number,
  mode: Mode,
  downloadMbps: number,
  uploadMbps: number,
  seconds: number,
  device?: Device,
  perSecond = 10,
): Result {
  return {
    id,
    startedAt,
    mode,
    download: fixtureTransfer(downloadMbps, seconds, perSecond),
    upload: fixtureTransfer(uploadMbps, seconds, perSecond),
    latency: { idleMs: 18.4, jitterMs: 1.2, downloadMs: 31.7, uploadMs: 44.9 },
    device,
  };
}

/**
 * Ten samples a second climb over the first second and waver within 3% the
 * way the meter's rolling rate does; one a second, as runs were saved before,
 * step within 4% from the first.
 */
function fixtureTransfer(mbps: number, seconds: number, perSecond: number): Transfer {
  const samples: Sample[] = Array.from({ length: seconds * perSecond }, (_, i) => {
    const t = (i + 1) / perSecond;
    const rate = perSecond === 1 ? mbps * (0.96 + ((i * 7) % 5) * 0.02) : mbps * Math.min(1, t) * (0.97 + 0.03 * Math.sin(t * 1.7));
    return { t, mbps: +rate.toPrecision(4) };
  });
  return { mbps, bytes: Math.round((mbps * 1e6 * seconds) / 8), seconds, samples };
}

/** `suffix` is a width, or `iphone` for the phone-sized WebKit shots beside the Chromium ones. */
export async function screenshot(page: Page, state: string, suffix: keyof typeof WIDTHS | 'iphone'): Promise<void> {
  await page.screenshot({ path: `screenshots/${state}-${suffix}.png`, fullPage: true });
}

/** How long a page may take to animate into its result before the suite gives up on it. */
export const SETTLE_LIMIT_MS = 5_000;

/** Waits for the page to mark its result settled: `data-settled` on the result element, set once the transition into it has finished. */
export async function waitForSettled(page: Page): Promise<void> {
  await expect(
    page.getByTestId('result'),
    `the result never set data-settled within ${SETTLE_LIMIT_MS} ms; a page sets it on the result element once its transition into the result has finished`,
  ).toHaveAttribute('data-settled', { timeout: SETTLE_LIMIT_MS });
}

/** How long a clip keeps rolling after the result settles, so it ends on the still scene. */
export const CLIP_TAIL_MS = 2_000;

/** Records the viewport to clips/<name>-<width>.webm while `act` runs, until the result settles, then for CLIP_TAIL_MS more. */
export async function recordClip(
  page: Page,
  name: string,
  width: keyof typeof WIDTHS,
  act: () => Promise<unknown>,
): Promise<void> {
  await page.screencast.start({ path: `clips/${name}-${width}.webm`, size: WIDTHS[width], fps: 30 });
  await act();
  await waitForSettled(page);
  await page.waitForTimeout(CLIP_TAIL_MS);
  await page.screencast.stop();
}

/** Fails when the page is wider than the viewport, which on a phone means a number or a row did not fit. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.html, 'document wider than the viewport').toBeLessThanOrEqual(widths.viewport);
  expect(widths.body, 'body wider than the viewport').toBeLessThanOrEqual(widths.viewport);
}

/** How far into a run ping is shown: two readings in, the third throw in the air. */
const PING_SHOT_MS = 2_800;

/**
 * Starts a fixed run and photographs it in each phase: ping two readings
 * in, then download and upload eight seconds into their thirty. Leaves the
 * run going; the caller waits for the result.
 */
export async function shootFixedRun(page: Page, shoot: (state: string) => Promise<void>): Promise<void> {
  await page.getByTestId('mode-fixed').click();
  await page.getByTestId('start').click();
  const running = page.getByTestId('running');
  await page.waitForTimeout(PING_SHOT_MS);
  await expect(running).toHaveAttribute('data-phase', 'latency');
  await shoot('ping');
  for (const phase of ['download', 'upload']) {
    await expect(running).toHaveAttribute('data-phase', phase, { timeout: 40_000 });
    await page.waitForTimeout(8_000);
    await expect(running).toHaveAttribute('data-phase', phase);
    await shoot(phase);
  }
}

/** Opens History over seeded runs and reopens the fixed one, settled. */
export async function reopenFixedRun(page: Page): Promise<void> {
  await openHistory(page);
  await page.locator('[data-testid=history-item][data-mode=fixed]').first().click();
  await expect(page.getByTestId('history-details')).toBeVisible();
  await waitForSettled(page);
  await page.waitForTimeout(600);
}
