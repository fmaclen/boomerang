import { expect, type Page } from '@playwright/test';
import { WIDTHS, parseQuantity, test } from './helpers';

// The big number glows on each ping catch and each milestone. Every frame
// of the run is sampled: each of the number's two spans (the director rolls
// one into the other) with its words, its opacity, its glow (its glow
// layer's opacity) and its pop (its scale). On a frame where the glow is up,
// the digits' boxes are measured with the glow drawn and again with it taken
// away, and must match: the glow never moves the number. Download is held at
// 600 Mbps, so it crosses three milestones, 100, 250 and 500, which ripple
// out 0.12 s apart while the number rolls in from ping's.

test.use({ viewport: WIDTHS.phone });
test.setTimeout(60_000);

const THROWS = 4;
const MILESTONES = [100, 250, 500, 750];

interface Frame {
  t: number;
  phase: string;
  /** Per span of the number: its text, opacity, glow and scale; and the unit line's spans' text and opacity. */
  nums: string[];
  ops: number[];
  glows: number[];
  scales: number[];
  units: string[];
  uops: number[];
  /** Whether a digits' box changed when the glow was taken away; null when no glow was up to check. */
  moved: boolean | null;
}

async function sample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: unknown[] };
    w.__frames = [];
    const unlit = document.createElement('style');
    unlit.textContent = '#lvNum > span::after { content: none !important; }';
    const box = (n: HTMLElement) => {
      const r = n.getBoundingClientRect();
      return [n.offsetLeft, n.offsetTop, n.offsetWidth, n.offsetHeight, r.x, r.y, r.width, r.height].join();
    };
    const tick = () => {
      const nums = [...document.querySelectorAll<HTMLElement>('#lvNum > span')];
      const units = [...document.querySelectorAll<HTMLElement>('#lvUnit > span')];
      if (nums.length) {
        const glows = nums.map((s) => Number(getComputedStyle(s, '::after').opacity));
        let moved = null;
        if (Math.max(...glows) > 0.5) {
          const lit = nums.map(box).join('|');
          document.head.append(unlit);
          moved = nums.map(box).join('|') !== lit;
          unlit.remove();
        }
        w.__frames.push({
          t: performance.now(),
          phase: document.getElementById('live')?.dataset.phase ?? '',
          nums: nums.map((s) => s.textContent),
          ops: nums.map((s) => Number(getComputedStyle(s).opacity)),
          glows,
          scales: nums.map((s) => Number(getComputedStyle(s).scale) || 1),
          units: units.map((s) => s.textContent),
          uops: units.map((s) => Number(getComputedStyle(s).opacity)),
          moved,
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function frames(page: Page): Promise<Frame[]> {
  return page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
}

/** The span holding the current reading: the first at rest, the incoming one while the number rolls. */
const current = (f: Frame) => (f.ops[0] === 1 && f.ops[1] === 0 ? 0 : 1);
const glowOf = (f: Frame) => f.glows[current(f)];

/** The separate beats the glow makes, each at its brightest frame: a rise past `hi` after a fall under `lo`. */
function beats(fs: Frame[], hi: number, lo: number): Frame[] {
  const crests: Frame[] = [];
  let lit = false;
  for (const f of fs) {
    const g = glowOf(f);
    if (!lit && g > hi) {
      crests.push(f);
      lit = true;
    } else if (lit && g < lo) lit = false;
    else if (lit && g > glowOf(crests[crests.length - 1])) crests[crests.length - 1] = f;
  }
  return crests;
}

/** The reading on screen in Mbps, or null while the number rolls. */
function reading(f: Frame): number | null {
  if (current(f) !== 0 || f.uops[0] !== 1 || f.uops[1] !== 0) return null;
  return parseQuantity(`${f.nums[0]} ${f.units[0]}`);
}

test('the number glows on each catch and each milestone, without moving', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 5,
    downloadThroughput: 600e6 / 8,
    uploadThroughput: 300e6 / 8,
  });
  await sample(page);
  await page.goto('/');
  await page.getByTestId('mode-adaptive').click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('running')).toHaveAttribute('data-phase', 'upload', { timeout: 30_000 });
  const all = await frames(page);

  // Ping: unlit at its greyed zero; the first reading lights it as it
  // shows, at full strength within a fifth of a second. Every catch glows.
  const ping = all.filter((f) => f.phase === 'latency');
  const first = ping.findIndex((f) => f.nums.some((n, i) => f.ops[i] === 1 && Number(n) > 0));
  expect(first).toBeGreaterThan(0);
  expect(Math.max(...ping.slice(0, first).map(glowOf))).toBe(0);
  expect(glowOf(ping[first])).toBeLessThan(0.5);
  const lit = ping.filter((f) => f.t >= ping[first].t && f.t <= ping[first].t + 200);
  expect(Math.max(...lit.map(glowOf))).toBeGreaterThan(0.9);
  expect(beats(ping, 0.6, 0.4)).toHaveLength(THROWS);

  // Download: one glow per milestone crossed, each its own crest, each on
  // the number's pop. Ping's reading, rolling away, takes none of them.
  const dl = all.filter((f) => f.phase === 'download');
  const peak = Math.max(...dl.map(reading).filter((r) => r !== null));
  expect(peak, 'download held under 750 Mbps').toBeLessThan(MILESTONES[3]);
  const crossed = MILESTONES.filter((m) => peak >= m).length;
  expect(crossed).toBeGreaterThanOrEqual(2);
  const crests = beats(dl, 0.65, 0.55);
  expect(crests).toHaveLength(crossed);
  for (const c of crests) expect(c.scales[current(c)]).toBeGreaterThan(1.01);
  const leaving = dl.filter((f) => f.units[0] === 'ms' && f.ops[0] > 0);
  expect(leaving.length).toBeGreaterThan(0);
  expect(Math.max(...leaving.map((f) => f.glows[0]))).toBeLessThan(0.05);

  // The digits' boxes are the same with the glow as without it.
  const checked = all.filter((f) => f.moved !== null);
  expect(checked.length).toBeGreaterThan(20);
  expect(checked.filter((f) => f.moved)).toHaveLength(0);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('leaves the number unlit', async ({ page }) => {
    await sample(page);
    await page.goto('/');
    await page.getByTestId('mode-adaptive').click();
    await page.getByTestId('start').click();
    await expect(page.getByTestId('running')).toHaveAttribute('data-phase', 'download', { timeout: 30_000 });
    const ping = (await frames(page)).filter((f) => f.phase === 'latency');
    expect(ping.some((f) => f.nums.some((n, i) => f.ops[i] === 1 && Number(n) > 0))).toBe(true);
    expect(Math.max(...ping.flatMap((f) => f.glows))).toBe(0);
  });
});
