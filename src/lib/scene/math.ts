// Small numeric helpers shared by the scene and the interface's motion.

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const sat = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
/** How far x is from a to b, clamped to 0..1. Either end may be Infinity, a moment not reached yet. */
export const span = (x: number, a: number, b: number) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a));
export const smooth = (a: number, b: number, v: number) => {
  const x = sat((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
/** Quintic smoothstep, and the shape of a glide's carried speed (see glide). */
export const hp = (s: number) => {
  s = sat(s);
  return s * s * s * (s * (s * 6 - 15) + 10);
};
export const hv = (s: number) => {
  s = sat(s);
  return s * (1 + s * s * (-6 + s * (8 - 3 * s)));
};
export const wrapPi = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU);
export const mod = (a: number) => a - TAU * Math.floor(a / TAU);
export type RGB = [number, number, number];
export const mixc = (a: RGB, b: RGB, f: number): RGB => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
/** A soft bump: zero at 0 with zero slope, peaks at t0, then a long tail. */
export const bump = (tau: number, t0: number) => (tau <= 0 ? 0 : (tau / t0) * (tau / t0) * Math.exp(2 * (1 - tau / t0)));

export function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** CSS-style cubic-bezier easing, tabulated once. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const N = 1024;
  const lut = new Float32Array(N + 1);
  const bx = (u: number) => 3 * x1 * u * (1 - u) * (1 - u) + 3 * x2 * u * u * (1 - u) + u * u * u;
  const by = (u: number) => 3 * y1 * u * (1 - u) * (1 - u) + 3 * y2 * u * u * (1 - u) + u * u * u;
  let u = 0;
  for (let j = 0; j <= N; j++) {
    while (u < 1 && bx(u) < j / N) u += 1 / 16384;
    lut[j] = by(Math.min(u, 1));
  }
  return (x) => {
    x = sat(x) * N;
    const j = Math.min(Math.floor(x), N - 1);
    return lerp(lut[j], lut[j + 1], x - j);
  };
}

// Emil Kowalski's curves: the strong ease-out for things arriving, the drawer
// curve for fades and dimming that should feel soft rather than snappy.
export const EASE_OUT = bezier(0.23, 1, 0.32, 1);
export const EASE_DRAWER = bezier(0.32, 0.72, 0, 1);
/** Ease-out cubic, for slow changes that should keep moving to the end. */
export const EASE_OUT_SOFT = bezier(0.33, 1, 0.68, 1);
/** Sine ease-in-out: gathers speed from rest and comes gently to rest again. */
export const EASE_IN_OUT_SINE = bezier(0.37, 0, 0.63, 1);
export const EASE_IN_OUT = bezier(0.77, 0, 0.175, 1);

/**
 * Critically damped smoothing: moves x toward a target over about T seconds,
 * carrying its velocity, so it starts gently and never overshoots however the
 * target moves. Returns [x, v]. (Game Programming Gems 4, "Critically Damped
 * Ease-In/Out Smoothing".)
 */
export function damp(x: number, v: number, target: number, T: number, dt: number): [number, number] {
  const w = 2 / T;
  const k = w * dt;
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const c = x - target;
  const q = (v + w * c) * dt;
  return [target + (c + q) * e, (v - w * q) * e];
}

/**
 * Carries a velocity v0 straight on and lands at rest D further along after
 * T seconds: a quintic with no jump in position, speed or acceleration at
 * either end. With D between 0.4 and 0.6 of v0 * T the speed only ever falls.
 */
export function glide(x0: number, v0: number, D: number, T: number, tau: number): number {
  const s = sat(tau / T);
  return x0 + D * hp(s) + v0 * T * hv(s);
}

/** How long a glide of distance D from speed v should take so its speed never rises. */
export function glideTime(v: number, D: number, T: number): number {
  if (Math.abs(v) < 1e-3 || v * D <= 0) return T;
  return clamp((clamp((v * T) / D, 5 / 3, 2.5) * D) / v, 0.8 * T, 1.25 * T);
}

// When a storm ends its shake rings down like a struck mass: ringDown is the
// share of the shake left tau seconds after the end, falling from a flat
// start over about two seconds, and calmTime is the clock the shake runs on,
// slowing from full pace to under half with no jump in phase or pace.
const RING_T = 0.45;
export const RING_END = 2.5;
const CALM = 0.55;
const CALM_T = 0.8;
export const ringDown = (tau: number) =>
  tau <= 0 ? 1 : (1 + tau / RING_T) * Math.exp(-tau / RING_T) * (1 - hp(tau / RING_END));
export const calmTime = (ts: number, t: number) =>
  t <= ts ? t : ts + (1 - CALM) * (t - ts) + CALM * CALM_T * (1 - Math.exp(-(t - ts) / CALM_T));

export const median = (a: number[]) => {
  if (!a.length) return 0;
  const b = [...a].sort((x, y) => x - y);
  const m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
};
