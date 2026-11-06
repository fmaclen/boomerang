// The swarm: one boomerang per share of the rate, orbiting the number. The
// model is a function of the run's clock t (seconds since Start), built step
// by step from the rate the run measures: log10(Mbps) is called x below, so 2
// is 100 Mbps, 3 a gigabit and 4 ten gigabits. A live run feeds it as the
// numbers arrive; a saved run is fed its samples all at once.

import {
  EASE_DRAWER,
  EASE_OUT,
  TAU,
  bump,
  calmTime,
  clamp,
  glide,
  glideTime,
  hash,
  hp,
  lerp,
  mixc,
  mod,
  mulberry32,
  ringDown,
  smooth,
  wrapPi,
  type RGB,
} from './math';

/** What the model shares with the scene: the swarm's scale in px, the camera's distance, and the idle clock carried into a run. */
export const env = { S: 200, CAM: 520, TW: 0, reduced: false };

export const NEUTRAL: RGB = [0.945, 0.969, 0.922];
export const LIME: RGB = [0.631, 1.0, 0.349];
export const LIME_ACC: RGB = [0.776, 1.0, 0.525];
export const ORANGE: RGB = [1.0, 0.478, 0.188];
export const ORANGE_ACC: RGB = [1.0, 0.72, 0.48];
/** Idle previews the run: white for ping, lime for download, orange for upload. */
export const IDLE_COL: RGB[] = [NEUTRAL, LIME, ORANGE, NEUTRAL, LIME, ORANGE];

// A boomerang keeps the colour of the rate when it was thrown: pale while the
// link is slow, more saturated as it climbs, lime deepening for download and
// orange heating toward red for upload. Stops at 10 Mbps, 100 Mbps, 1 and 10 Gbps.
const RAMP: RGB[][] = [
  [[0.8, 0.93, 0.68], [0.72, 0.98, 0.5], LIME, [0.5, 1.0, 0.16]],
  [[1.0, 0.8, 0.64], [1.0, 0.64, 0.4], ORANGE, [1.0, 0.3, 0.12]],
];
export function rampCol(dir: number, x: number): RGB {
  const r = RAMP[dir > 0 ? 0 : 1];
  const u = clamp(x - 1, 0, 2.999);
  const k = Math.floor(u);
  return mixc(r[k], r[k + 1], smooth(0, 1, u - k));
}

// Lively by 100 Mbps, busy at a gigabit, a full storm by 10 Gbps. The orbit
// stays a slow churn at every speed; the count, the wave and the shake escalate.
export const busyOf = (x: number) => smooth(1.5, 3.0, x);
export const wildOf = (x: number) => smooth(2.8, 3.9, x);
export const stormOf = (x: number) => smooth(3.3, 4.0, x);
const OMEGA_KNOTS = [[1.3, 0.18], [2.0, 0.3], [2.6, 0.42], [3.0, 0.54], [3.5, 0.68], [4.0, 0.85], [4.5, 1.0]];
export function omegaOf(x: number): number {
  const k = OMEGA_KNOTS;
  if (x <= k[0][0]) return k[0][1];
  for (let j = 1; j < k.length; j++) {
    if (x <= k[j][0]) {
      const f = (x - k[j - 1][0]) / (k[j][0] - k[j - 1][0]);
      return k[j - 1][1] * Math.pow(k[j][1] / k[j - 1][1], f);
    }
  }
  return k[k.length - 1][1];
}
/** About 30 pieces at 100 Mbps, 140 at a gigabit, 650 at 10 Gbps. */
const countOf = (x: number) => 30 * Math.pow(10, 0.668 * (x - 2));
/** Where the model starts before a direction has a rate: 20 Mbps, so idle looks the same whatever comes next. */
export const X_IDLE = Math.log10(20);
/** How quickly the swarm follows the measured rate. */
const FOLLOW_T = 0.3;

// Milestones, in Mbps: the first time a direction crosses each it earns one
// reward, each stronger than the last up to the end of the list. Past the
// list, every further MILESTONE_STEP repeats the strongest.
const MILESTONES = [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 9500, 10000];
const MILESTONE_STEP = 10000;
const milestoneAt = (j: number) =>
  j < MILESTONES.length ? MILESTONES[j] : MILESTONES[MILESTONES.length - 1] + MILESTONE_STEP * (j - MILESTONES.length + 1);

/**
 * Milestones one reading crosses together ripple out one after another,
 * RIPPLE seconds apart, so each shockwave reads on its own, even on a steady
 * climb through the gigabits.
 */
const RIPPLE = 0.12;

/** One reward: when, its strength from 0 (first milestone) to 1 (last), the same on the old 1 to 6 scale, and whether it is the gigabit. */
export interface Reward {
  t: number;
  s: number;
  level: number;
  giga: boolean;
}

export const DT = 1 / 240;
/** Seconds a joining piece takes to slide into its lane. */
const ENTRY = 1.3;
/** Resting piece size, in units of S. */
const REST = 0.04;
/** A resting band holds about REST_CROWD pieces at full size; a bigger crowd rests smaller and darker. */
const REST_CROWD = 170;
export const REST_A = 0.85;
/** Download's light while upload runs: a memory of it. */
export const MEMORY = 0.3;

const SEED_GAP = [0.62, 1.38, 0.8, 1.22, 0.55, 1.43];
const SEED_LANE = [0.38, 0.58, 0.44, 0.66, 0.32, 0.52];
const SEED_SIZE = [1.2, 0.8, 1.05, 0.72, 1.3, 0.9];
const SEED_PACE = [1, 0.9, 1.08, 0.86, 1.04, 0.95];

interface Piece {
  lane: number;
  k: number;
  th0: number;
  incl0: number;
  Om: number;
  bank0: number;
  bp: number;
  sf: number;
  size: number;
  spin0: number;
  wf: number;
  wp: number;
  j1: number;
  j2: number;
  rj: number;
  u: number;
}

/** A piece as drawn: where it is on its orbit, how it is turned, and how much of it shows. */
export interface Pose {
  th: number;
  r: number;
  incl: number;
  Om: number;
  bank: number;
  jr: number;
  spin: number;
  size: number;
  alpha: number;
  shade: number;
  /** How much the hand moves it (only idle pieces answer it), and its slot in the hand's push state. */
  w: number;
  id: number;
  tag: number;
  /** A push on screen from Start's blast, in scene units. */
  sx: number;
  sy: number;
  off?: [number, number, number];
}
export const pose = (): Pose => ({ th: 0, r: 0, incl: 0, Om: 0, bank: 0, jr: 0, spin: 0, size: 0, alpha: 0, shade: 1, w: 0, id: -1, tag: 0, sx: 0, sy: 0 });

interface Rest {
  p: Piece;
  th: number;
  r: number;
  incl: number;
  Om: number;
  spin: number;
  size: number;
  bank: number;
  alpha: number;
  jamp: number;
  w: number;
  vr: number;
  vi: number;
  ws: number;
  vb: number;
  wr: number;
  wsr: number;
  shadeRest: number;
  Dth: number;
  Tth: number;
  Dr: number;
  Di: number;
  Db: number;
  Dsz: number;
  Dsp: number;
  Tsp: number;
  ce: number;
  slot: number;
}

export interface SwarmOptions {
  /** 1 for download, -1 for upload: which way it turns. */
  dir: 1 | -1;
  /** How long it glides to rest after its phase. */
  T: number;
  /** How long the count takes to open up at the start. */
  rise: number;
  max: number;
  /** Pieces it starts with: download keeps idle's six. */
  seeds: number;
  seed: number;
  acc: RGB;
  /** Where the resting scatter sits, in S, and how loose it is. */
  bandR: number;
  spread: number;
}

/**
 * Called for an idle piece Start's blast is carrying off, with its pose:
 * sets the push on screen (sx, sy) and returns how much of it is left.
 */
export type Blow = (o: Pose, t: number) => number;

export class Swarm {
  readonly o: SwarmOptions;
  readonly p: Piece[] = [];
  /** When its phase starts and ends on the run's clock; Infinity until known. */
  t0 = Infinity;
  t1 = Infinity;
  /** x, the phase angle the orbit has turned, and joins, at every DT step from t = 0. */
  private xs: number[] = [];
  private phis: number[] = [0];
  readonly join: Float64Array;
  readonly pc: RGB[];
  private have = 0;
  private xv = 0;
  private target = X_IDLE;
  readonly rewards: Reward[] = [];
  private nextMilestone = 0;
  st: (Rest | null)[] = [];
  brightEnd = 1;
  restA = REST_A;
  /** The idle orbit's pace, which the run carries on from. */
  static idleW = omegaOf(X_IDLE);

  constructor(o: SwarmOptions, idleSeed: number) {
    this.o = o;
    this.join = new Float64Array(o.max).fill(Infinity);
    for (; this.have < o.seeds; this.have++) this.join[this.have] = -1e9;
    this.pc = Array.from({ length: o.max }, () => NEUTRAL);
    const rng = mulberry32(o.seed);
    for (let i = 0; i < o.max; i++) {
      const lane = Math.pow(rng(), 1.35);
      this.p.push({
        lane,
        k: lerp(1.4, 0.78, lane) * (0.93 + 0.14 * rng()),
        th0: 0,
        // The swarm is a disc seen from a little above, its near side below
        // the number: each orbit tilts back about a roughly level line, with
        // enough spread that the pieces cross one another in depth.
        incl0: -0.5 + 0.4 * (rng() * 2 - 1),
        Om: 0.4 * (rng() * 2 - 1),
        // How far the disc leans from facing the centre toward lying in its orbit.
        bank0: 0.75 + 0.5 * rng(),
        bp: rng() * TAU,
        sf: (0.8 + 0.4 * rng()) * (rng() < 0.5 ? 1 : -1),
        size: 0.85 + 0.3 * rng(),
        spin0: rng() * TAU,
        wf: 0.5 + 0.7 * rng(),
        wp: rng() * TAU,
        j1: rng() * TAU,
        j2: rng() * TAU,
        rj: rng() * 2 - 1,
        u: rng(),
      });
    }
    // Golden-angle spacing on screen keeps any number of pieces evenly spread.
    for (let i = 0; i < o.max; i++) this.p[i].th0 = i * 2.39996323 + 0.35 * rng() - this.p[i].Om;
    // The six idle pieces circle Start on one tilt, but not one rhythm:
    // uneven gaps, a lane, a size and a pace each, and each orbit turned a
    // little from the next, so they read as a loose flock rather than a dial.
    // Each load deals them out afresh.
    const deal = mulberry32(idleSeed * 7919 + 17);
    const shuffled = (a: number[]) => {
      const b = a.slice(0, o.seeds);
      for (let k = b.length - 1; k > 0; k--) {
        const j = Math.floor(deal() * (k + 1));
        [b[k], b[j]] = [b[j], b[k]];
      }
      return b;
    };
    const gaps = shuffled(SEED_GAP);
    const lanes = shuffled(SEED_LANE);
    const sizes = shuffled(SEED_SIZE);
    const paces = shuffled(SEED_PACE);
    const gapSum = gaps.reduce((a, b) => a + b, 0);
    const tiltPh = deal() * TAU;
    const inclPh = deal() * TAU;
    let gap = deal() * TAU;
    for (let i = 0; i < o.seeds; i++) {
      const p = this.p[i];
      p.lane = lanes[i];
      p.k = paces[i];
      p.wf = 0.6;
      p.wp = deal() * TAU;
      p.spin0 = deal() * TAU;
      p.Om = 0.3 * Math.sin(1.7 * i + tiltPh);
      p.th0 = gap - p.Om;
      p.incl0 = -0.55 + 0.1 * Math.sin(2.3 * i + inclPh);
      p.bank0 = 0.95;
      p.bp = 0;
      p.sf = 1;
      p.size = sizes[i];
      gap += (TAU * gaps[i]) / gapSum;
    }
  }

  get max(): number {
    return this.o.max;
  }

  /** The phase begins at t. */
  start(t: number): void {
    this.t0 = t;
  }

  /** The measured rate at t, in Mbps: the swarm follows it, and a first crossing of a milestone earns a reward. */
  feed(t: number, mbps: number): void {
    if (mbps > 0) this.target = Math.log10(Math.max(mbps, 0.1));
    while (t >= this.t0 && t < this.t1 && mbps >= milestoneAt(this.nextMilestone)) {
      const j = this.nextMilestone++;
      const s = Math.min(j, MILESTONES.length - 1) / (MILESTONES.length - 1);
      const last = this.rewards[this.rewards.length - 1];
      this.rewards.push({ t: last ? Math.max(t, last.t + RIPPLE) : t, s, level: 1 + 5 * s, giga: milestoneAt(j) === 1000 });
    }
  }

  /** The phase ended at t: the swarm stops taking new pieces and glides to rest from here; a ripple still to come ends with it. */
  end(t: number): void {
    this.advance(t);
    this.t1 = t;
    while (this.rewards.length && this.rewards[this.rewards.length - 1].t >= t) this.rewards.pop();
    this.prepareSettle();
  }

  /** Builds the tables up to t. */
  advance(t: number): void {
    const omega0 = this.omega(0);
    while (this.xs.length * DT <= t + DT) {
      const k = this.xs.length;
      const tk = k * DT;
      let x = k ? this.xs[k - 1] : X_IDLE;
      if (tk >= this.t0 && tk < this.t1) {
        if (tk - this.t0 < DT) {
          for (let i = 0; i < this.o.seeds; i++) this.pc[i] = rampCol(this.o.dir, x);
        }
        [x, this.xv] = stepToward(x, this.xv, this.target);
      }
      this.xs.push(x);
      this.phis.push(this.phis[k] + (tk <= 0 ? omega0 : this.omega(tk)) * DT);
      if (tk >= this.t0 && tk < this.t1) {
        const n = this.count(tk);
        while (this.have < this.o.max && n > this.have) {
          this.pc[this.have] = rampCol(this.o.dir, x);
          this.join[this.have++] = tk;
        }
      }
    }
  }

  x(t: number): number {
    const n = this.xs.length;
    if (!n) return X_IDLE;
    const u = clamp(t / DT, 0, n - 1.001);
    const k = Math.floor(u);
    return k + 1 < n ? lerp(this.xs[k], this.xs[k + 1], u - k) : this.xs[n - 1];
  }

  private omega(t: number): number {
    if (this.o.seeds && t <= 0) return Swarm.idleW;
    if (!this.o.seeds && t < this.t0) return 0;
    return omegaOf(this.x(t));
  }

  /** The orbit's phase. Before Start the idle orbit runs on its own clock, TW; its angle carries into the run so Start never jumps a piece. */
  phi(t: number): number {
    const off = this.omega(0) * env.TW;
    if (t <= 0) return off + t * this.omega(0);
    const n = this.phis.length;
    const u = clamp(t / DT, 0, n - 1.001);
    const k = Math.floor(u);
    return off + (k + 1 < n ? lerp(this.phis[k], this.phis[k + 1], u - k) : this.phis[n - 1]);
  }

  count(t: number): number {
    return this.o.seeds + Math.max(0, countOf(this.x(t)) - this.o.seeds) * hp((t - this.t0) / this.o.rise);
  }

  joinedAt(t: number): number {
    let n = 0;
    while (n < this.o.max && this.join[n] <= t) n++;
    return n;
  }

  /** Each reward swells the swarm outward and lets it relax; rewards close together take the strongest swell. */
  swell(t: number): number {
    let s = 0;
    for (const r of this.rewards) if (t > r.t && t < r.t + 2) s = Math.max(s, (0.02 + 0.025 * r.level) * bump(t - r.t, 0.2));
    return 1 + s;
  }

  /** How far through its exit, 0 to 1. Download's storm rings down, dimming as it goes; upload's light settles into the result. */
  exitOf(tau: number): number {
    return this.o.dir > 0 ? 1 - ringDown(tau) : hp(tau / this.o.T);
  }

  /** Brightness while live, from the crowd: pieces are solid and drawn over each other, so a crowd darkens a little rather than adding up to a blaze. */
  liveBright(t: number): number {
    return crowdOf(Math.min(this.count(t), this.o.max));
  }

  /** Brightness after its phase. Download dims to a memory as its storm settles and stays dim through upload; both come up for the result. */
  restBright(t: number, ulEnd: number): number {
    if (this.o.dir < 0) return lerp(this.brightEnd, this.restA, EASE_DRAWER((t - this.t1) / this.o.T));
    return lerp(lerp(this.brightEnd, MEMORY, this.exitOf(t - this.t1)), this.restA, hp((t - ulEnd) / 1.2));
  }

  /**
   * A piece in flight: the lane it orbits on, plus the slide into that lane
   * when it joins. Each orbit is tilted toward or away from the viewer, and
   * the piece banks along it and spins about its own centre.
   */
  live(i: number, t: number, o: Pose, blow?: Blow): boolean {
    const p = this.p[i];
    const S = env.S;
    let age = t - this.join[i];
    let blown = false;
    // Once Start is pressed its shockwave blows the idle pieces off the
    // screen, and they come back as download's first pieces when it begins.
    if (i < this.o.seeds && t > 0) {
      if (t < this.t0) blown = true;
      else age = t - this.t0;
    }
    if (age < 0) {
      o.alpha = 0;
      return false;
    }
    const x = this.x(t);
    const busy = busyOf(x);
    const wild = wildOf(x);
    const storm = stormOf(x);
    // The lanes start outside the number, which owns the eye.
    const rin = 0.5 - 0.04 * busy;
    const rout = 0.88 - 0.08 * busy - 0.04 * wild + 0.25 * storm;
    const rL = (S * (rin + p.lane * (rout - rin)) + S * 0.04 * (1 - 0.75 * busy) * Math.sin((t + env.TW) * p.wf + p.wp)) * this.swell(t);
    const ph = this.phi(t);
    let incl = p.incl0;
    let thX = 0;
    let rX = 0;
    let alpha = 1;
    if (age < ENTRY) {
      // Download pieces slide in from just outside their lane, upload pieces
      // from the eye; both fade up as they come rather than popping in.
      const e = EASE_OUT(age / ENTRY);
      const r0 = this.o.dir > 0 ? rL + S * 0.5 : S * 0.1;
      rX = (1 - e) * (r0 - rL);
      thX = -this.o.dir * (1 - e) * 0.6;
      incl *= e;
      alpha = EASE_OUT(age / 0.5);
    }
    const th = p.th0 + this.o.dir * p.k * ph + thX;
    // Weight: a piece runs a little faster through the bottom of its loop and slower over the top.
    o.th = th + 0.1 * Math.cos(th + p.Om);
    o.r = rL + rX;
    o.incl = incl;
    o.Om = p.Om;
    // The disc lays over and back as it goes round.
    o.bank = p.bank0 + 0.25 * Math.sin(th + p.bp);
    o.jr = env.reduced ? 0 : S * 0.06 * storm * Math.sin(t * 29.0 + p.j1) * Math.sin(t * 13.7 + p.j2);
    o.spin = p.spin0 + p.sf * (1.4 * (t + env.TW) + 1.4 * p.k * ph);
    o.w = i < this.o.seeds && t < this.t0 ? 1 : 0; // only the idle pieces answer the hand
    o.id = o.w ? i : -1;
    o.tag = 0;
    o.size = S * (0.07 - 0.02 * busy - 0.008 * wild) * p.size;
    o.off = undefined;
    o.sx = 0;
    o.sy = 0;
    if (blown) alpha *= blow ? blow(o, t) : 0;
    o.alpha = alpha;
    o.shade = 1;
    return true;
  }

  /**
   * After its phase the swarm glides to rest: every piece carries on at the
   * speed it had and slows along one long curve, and a storm's shake rings
   * down. Every piece stays, settling loosely into a band that keeps turning
   * slowly, so the swarm at rest is the swarm that flew.
   */
  settle(i: number, t: number, o: Pose): boolean {
    const s = this.st[i];
    if (!s) {
      o.alpha = 0;
      return false;
    }
    const tau = t - this.t1;
    const T = this.o.T;
    o.Om = s.Om;
    o.th = glide(s.th, s.w - s.wr, s.Dth, s.Tth, tau) + s.wr * tau;
    o.r = glide(s.r, s.vr, s.Dr, T, tau);
    o.incl = glide(s.incl, s.vi, s.Di, T, tau);
    o.bank = glide(s.bank, s.vb, s.Db, T, tau);
    o.spin = glide(s.spin, s.ws - s.wsr, s.Dsp, s.Tsp, tau) + s.wsr * tau;
    o.size = glide(s.size, 0, s.Dsz, T, tau);
    const tc = calmTime(this.t1, t);
    o.jr = s.jamp * Math.sin(tc * 29.0 + s.p.j1) * Math.sin(tc * 13.7 + s.p.j2) * ringDown(tau);
    o.alpha = lerp(s.alpha, 1, hp(tau / 0.6));
    o.shade = lerp(1, s.shadeRest, this.exitOf(tau));
    o.w = 0;
    o.id = -1;
    o.sx = 0;
    o.sy = 0;
    o.off = undefined;
    return true;
  }

  /** Works out where every piece comes to rest. Called when the phase ends and again whenever the scale changes. */
  prepareSettle(): void {
    if (!Number.isFinite(this.t1)) return;
    const T = this.o.T;
    const te = this.t1 - 1e-4;
    const h = 1 / 120;
    const x = this.x(te);
    const A = pose();
    const B = pose();
    this.brightEnd = this.liveBright(te);
    const jamp = env.reduced ? 0 : env.S * 0.06 * stormOf(x);
    this.st = new Array(this.o.max).fill(null);
    const all: Rest[] = [];
    const nJ = this.joinedAt(te);
    for (let i = 0; i < nJ; i++) {
      this.live(i, te, A);
      const ok = this.live(i, te - h, B);
      const s = {
        p: this.p[i], th: A.th, r: A.r, incl: A.incl, Om: A.Om, spin: A.spin, size: A.size, bank: A.bank,
        alpha: A.alpha, jamp, wr: 0, wsr: 0, shadeRest: 1,
        w: ok ? (A.th - B.th) / h : 0, vr: ok ? (A.r - B.r) / h : 0,
        vi: ok ? (A.incl - B.incl) / h : 0, ws: ok ? (A.spin - B.spin) / h : 0,
        vb: ok ? (A.bank - B.bank) / h : 0,
        Dth: 0, Tth: T, Dr: 0, Di: 0, Db: 0, Dsz: 0, Dsp: 0, Tsp: T, ce: 0, slot: 0,
      };
      this.st[i] = s;
      all.push(s);
    }
    // Each piece takes the nearest of evenly spread angles, then strays from
    // it: a loose scatter in a band, mostly facing the viewer at slight tilts
    // so the light catches each one differently. A few are large and bright,
    // many small and dim. Download turns one way, upload the other.
    const K = all.length;
    this.restA = REST_A * crowdOf(K);
    if (!K) return;
    const restSize = Math.min(1, Math.pow(REST_CROWD / K, 0.35));
    const turn = this.o.dir * 0.06;
    for (const s of all) {
      s.wr = turn;
      s.Dth = 0.5 * (s.w - turn) * T;
      s.ce = s.th + s.Dth + turn * T + s.Om;
    }
    all.sort((a, b) => mod(a.ce) - mod(b.ce));
    let cx = 0;
    let cy = 0;
    all.forEach((s, j) => {
      const d = mod(s.ce) - (TAU * j) / K;
      cx += Math.cos(d);
      cy += Math.sin(d);
    });
    const base = Math.atan2(cy, cx);
    const seed = this.o.seed;
    all.forEach((s, j) => {
      const q = s.p;
      const h1 = hash(j, 31 + seed);
      const h2 = hash(j, 47 + seed);
      const h3 = hash(j, 59 + seed);
      const slot = base + (TAU * (j + 0.8 * (h1 - 0.5))) / K;
      s.slot = slot;
      s.Dth += wrapPi(slot - s.ce);
      s.Tth = glideTime(s.w - turn, s.Dth, T);
      s.Dr = env.S * (this.o.bandR + this.o.spread * (h2 + h3 - 1)) - s.r;
      s.Di = 0.35 * q.rj - s.incl;
      s.Db = 1.2 + 0.3 * q.u - s.bank;
      const big = Math.pow(q.u, 1.8);
      s.Dsz = env.S * REST * restSize * (0.5 + 1.0 * big) - s.size;
      s.shadeRest = (this.o.dir > 0 ? 0.4 : 0.6) + 0.6 * big;
      s.wsr = (q.sf > 0 ? 1 : -1) * (0.12 + 0.2 * h1);
      s.Dsp = 0.5 * (s.ws - s.wsr) * T;
      s.Tsp = T;
    });
  }
}

const crowdOf = (n: number) => 1.0 - 0.3 * smooth(60, 600, n);

// The swarm follows the rate along a critically damped curve, so a jump in
// the measurement never jolts it.
function stepToward(x: number, v: number, target: number): [number, number] {
  const w = 2 / FOLLOW_T;
  const k = w * DT;
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const c = x - target;
  const q = (v + w * c) * DT;
  return [target + (c + q) * e, (v - w * q) * e];
}

/**
 * The two swarms of a run. T is how long each glides to rest: download's is
 * long enough that its trailing pieces still settle while the first upload
 * pieces rise. bandR and spread place the resting scatter: a loose band whose
 * inner edge stays clear of the result's words.
 */
export function makeSwarms(idleSeed: number): { D: Swarm; U: Swarm } {
  return {
    D: new Swarm({ dir: 1, T: 3.0, rise: 0.9, max: 720, seeds: 6, seed: 7, acc: LIME_ACC, bandR: 0.85, spread: 0.105 }, idleSeed),
    U: new Swarm({ dir: -1, T: 2.6, rise: 1.6, max: 560, seeds: 0, seed: 11, acc: ORANGE_ACC, bandR: 0.775, spread: 0.065 }, idleSeed),
  };
}
