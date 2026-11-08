// Ping: one boomerang at a time leaves the eye, flies out and comes back, the
// way a ping goes to the box and returns. Each throw flies a real boomerang's
// flight seen from above, a teardrop: a long, narrow outward leg that banks
// round a tight turn at the far end and comes home on a wider curve, turning
// the same way the whole time. Its pace changes the way a thrown one's does:
// fastest off the hand, under a third of that through the far turn, picking
// up again on the way back and slowing at a steady rate into the catch.

import { TAU, clamp, lerp, smooth } from './math';

/** Which way each throw leaves the eye, round the clock. */
export const PING_ANGLE = [1.0, -2.1, 2.5, -0.5];
/** How wide the teardrop is for its length (it comes out a little over half). */
const PING_WIDE = 0.36;
/** How far the outward and the return legs bow out. */
const PING_OUT = 0.5;
const PING_BACK = 1.5;
/** Turns per throw. */
export const PING_SPIN = 2;
/** The farthest a loop reaches, in S; the layout trims each throw to the room in its direction. */
export const PING_MAX = 1.3;
export const PING_MIN = 0.92;
export const pingReach = PING_ANGLE.map(() => PING_MIN);

const tear = (ph: number): [number, number] => [
  (1 - Math.cos(ph)) / 2,
  PING_WIDE * Math.sin(ph) * Math.sin(ph / 2) * lerp(PING_OUT, PING_BACK, (1 - Math.cos(ph / 2)) / 2),
];

function lookup(xs: Float64Array, ys: Float64Array, x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (x <= xs[lo]) return ys[lo];
  if (x >= xs[hi]) return ys[hi];
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= x) lo = m;
    else hi = m;
  }
  return lerp(ys[lo], ys[hi], (x - xs[lo]) / (xs[hi] - xs[lo]));
}

// Tables for one throw: the curve's angle by the share of its length flown
// (arc), and the share flown by the share of the flight's time.
const PT = (() => {
  const N = 720;
  const ph = new Float64Array(N + 1);
  const arc = new Float64Array(N + 1);
  let [px, py] = tear(0);
  for (let k = 1; k <= N; k++) {
    ph[k] = (TAU * k) / N;
    const [x, y] = tear(ph[k]);
    arc[k] = arc[k - 1] + Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  for (let k = 1; k <= N; k++) arc[k] /= arc[N];
  // Speed by the share flown: full off the hand, under a third round the far
  // turn, 0.85 at most on the way back, then a steady slowing into the catch.
  const far = arc[N / 2];
  const speed = (d: number) =>
    lerp(1, 0.85, smooth(0.2, 0.8, d)) * (1 - 0.7 * Math.exp(-(((d - far) / 0.16) ** 2))) * Math.sqrt(1 - Math.exp(-(1 - d) / 0.1));
  const s = new Float64Array(N + 1);
  const time = new Float64Array(N + 1);
  for (let k = 1; k <= N; k++) {
    s[k] = k / N;
    time[k] = time[k - 1] + 1 / N / speed((k - 0.5) / N);
  }
  for (let k = 1; k <= N; k++) time[k] /= time[N];
  return { ph, arc, s, time };
})();

/** Where throw i is once it has flown share d of its path, as [radius in S, angle] about the eye. */
export function pingAt(i: number, d: number): [number, number] {
  const j = i % PING_ANGLE.length;
  const L = pingReach[j] - 0.46;
  const [x, y] = tear(lookup(PT.arc, PT.ph, d));
  const X = 0.46 + L * x;
  const Y = L * y;
  return [Math.hypot(X, Y), PING_ANGLE[j] + Math.atan2(Y, X)];
}

/** The share of its path a throw has flown at share u of its flight's time. */
export const pingFlown = (u: number) => lookup(PT.time, PT.s, clamp(u, 0, 1));
/** The share of the flight's time at which a throw has flown share d of its path. */
export const pingTimeOf = (d: number) => lookup(PT.s, PT.time, d);
export const pingPath = (i: number, u: number) => pingAt(i, pingFlown(u));

/**
 * Trims each throw's loop to the room in its direction: up to PING_MAX, as
 * long as every point of it stays inside the window (x0..x1, y0..y1) and
 * clear of the interface's boxes, a margin of the swarm's size away.
 */
export function fitReach(c: { cx: number; cy: number }, S: number, bounds: number[], boxes: number[][]): void {
  const pad = S * 0.12 + 6;
  const [x0, y0, x1, y1] = bounds;
  const roomy = (x: number, y: number) =>
    x > x0 + pad && x < x1 - pad && y > y0 + pad && y < y1 - pad && boxes.every(([a, b, c, d]) => x < a - pad || x > c + pad || y < b - pad || y > d + pad);
  PING_ANGLE.forEach((_, j) => {
    let lo = PING_MIN;
    let hi = PING_MAX;
    for (let it = 0; it < 16; it++) {
      pingReach[j] = (lo + hi) / 2;
      let ok = true;
      for (let q = 0; q <= 60 && ok; q++) {
        const [r, th] = pingPath(j, q / 60);
        ok = roomy(c.cx + S * r * Math.cos(th), c.cy - S * r * Math.sin(th));
      }
      if (ok) lo = pingReach[j];
      else hi = pingReach[j];
    }
    pingReach[j] = lo;
  });
}
