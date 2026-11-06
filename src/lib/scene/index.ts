// The scene: a swarm of boomerangs behind the interface, in WebGL2. The page
// drives it with one frame description per animation frame (SceneFrame) and
// tells it about the run as it goes:
//
//   const scene = Scene.create(canvas, seed);
//   scene.layout(w, h, dpr, S, cams);   // on every resize
//   scene.newRun();                     // Start pressed
//   scene.throws.push(t);               // a ping throw leaves at run time t
//   scene.D.start(t); scene.D.feed(t, mbps); scene.D.end(t);   // download, likewise U
//   scene.frame(view);                  // every frame
//
// Idle is six pieces circling Start plus boomerangs drifting over the whole
// screen. Start's shockwave clears them; ping throws one boomerang out and
// back per reading; each direction then fills a swarm whose count, colour,
// shake and rewards follow the measured rate, and settles into a loose band
// when its phase ends.

import { Renderer, type Composite } from './gl';
import {
  EASE_IN_OUT,
  EASE_IN_OUT_SINE,
  EASE_OUT,
  RING_END,
  TAU,
  calmTime,
  clamp,
  damp,
  glide,
  hash,
  lerp,
  mixc,
  mulberry32,
  ringDown,
  smooth,
  span,
  type RGB,
} from './math';
import { PING_SPIN, pingAt, pingFlown, pingTimeOf } from './ping';
import {
  IDLE_COL,
  LIME,
  NEUTRAL,
  ORANGE,
  Swarm,
  env,
  makeSwarms,
  omegaOf,
  pose,
  rampCol,
  stormOf,
  type Pose,
} from './swarm';
import { BLAST_AT, BLAST_DUR, CLEAR, CLEAR_FADE, FLY, START_SWELL, TRIP } from '../run/timing';

export { env } from './swarm';
export type { Swarm } from './swarm';

export interface Cam {
  zoom: number;
  cx: number;
  cy: number;
}

/** The hand: the eased cursor or tilt, -1 to 1 each way with y up, and the cursor on screen. */
export interface Hand {
  x: number;
  y: number;
  mouseOn: number;
  rx: number;
  ry: number;
  tilt: boolean;
  mouse: boolean;
  dt: number;
}

export interface SceneFrame {
  /** Whether a run is on screen, at run time t, and how strongly (it fades out on the way home). */
  run: boolean;
  t: number;
  runTW: number;
  runGf: number;
  /** The six idle pieces, how strongly and on the idle clock. */
  idleGf: number;
  idleTW: number;
  /** The drifting field: idle's own, or the one Start is clearing (clear is seconds since Start, -1 in idle). */
  drift: { clock: number; gf: number; clear: number } | null;
  /** How much the idle pieces answer the hand, and lean in toward Start under a resting cursor. */
  handK: number;
  lean: number;
  startX: number;
  startY: number;
  /** The camera: zoom and the swarm's centre on screen. */
  zoom: number;
  cx: number;
  cy: number;
  boxes: Float32Array;
  boxK: Float32Array;
  eyeX: number;
  eyeY: number;
  eyeR: number;
  eyeK: number;
  hand: Hand;
}

/** How far the camera has come from the idle layout to the run's, t into a run. */
export const runCam = (t: number) => EASE_IN_OUT(span(t, 0.1, 1.5));

// The cursor repels the idle pieces; a phone's tilt slides them toward the
// lower side; a cursor resting on Start draws the nearest in. Each piece
// eases toward its push along a critically damped curve, quicker going aside
// than coming back, so it moves aside in one motion and glides back after.
const REPEL_R = 0.72; // the cursor's reach, in S at the idle zoom
const REPEL_PUSH = 1.5; // the push right under it, in reaches
const TILT_PUSH = 0.42; // how far a full tilt slides the nearest pieces, in S
const PUSH_OUT = 0.22;
const PUSH_BACK = 0.75;
// While the cursor rests on Start the pieces round it lean in toward its
// centre: most at LEAN_AT of its radius, LEAN_PULL of a radius, none beyond
// LEAN_AT + LEAN_W radii.
const LEAN_AT = 1.3;
const LEAN_W = 1.5;
const LEAN_PULL = 0.22;

// Rewards: each milestone a little bigger than the last. A shockwave's life
// and the sparks thrown, from the first milestone's to the last's.
const WAVE_DUR = [1.6, 2.0];
const SPARKS = [20, 90];

// The idle drift: about one boomerang per 8,500 px², up to DRIFT_MAX.
const DRIFT_COL = [NEUTRAL, LIME, ORANGE];
const DRIFT_MAX = 84;

interface PushState {
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  va: number;
  tag: number;
}

export class Scene {
  private r: Renderer;
  D!: Swarm;
  U!: Swarm;
  /** Ping throws: when each leaves on the run's clock. */
  throws: number[] = [];
  /** When upload ended, for the result's glint and download coming back up. */
  ulEnd = Infinity;
  cam: { run: Cam; idle: Cam } = { run: { zoom: 1, cx: 0, cy: 0 }, idle: { zoom: 1, cx: 0, cy: 0 } };
  private W = 400;
  private H = 680;
  /** The run's farthest screen corner from the eye, and idle's from Start. */
  private far = 800;
  private farIdle = 800;
  private seed: number;
  private flock: { g: number; n: number; m: number }[];
  private salt: number;
  private pushState: PushState[] = Array.from({ length: 128 }, () => ({ x: 0, y: 0, a: 0, vx: 0, vy: 0, va: 0, tag: -1 }));
  private hu = { x: 0, y: 0, k: 0, cx: 0, cy: 0, reach: 200, push: 300, tilt: 0, zoom: 1, dt: 0, lean: 0, sx: 0, sy: 0, disc: 100 };
  private hp: [number, number, number] = [0, 0, 0];
  private A = pose();
  private C = pose();
  private DR = pose();
  private swp = { x: 0, y: 0 };

  static create(canvas: HTMLCanvasElement, seed: number): Scene | null {
    const r = Renderer.create(canvas, 720 + 560 + 8 + DRIFT_MAX + 8);
    return r ? new Scene(r, seed) : null;
  }

  private constructor(r: Renderer, seed: number) {
    this.r = r;
    this.seed = seed;
    // The load's seed salts every drift flight, so each visit throws its own.
    this.salt = Math.imul(seed, 104729) | 0;
    const rng = mulberry32(29 + this.salt);
    this.flock = [];
    for (let g = 0; this.flock.length < DRIFT_MAX; g++) {
      const n = rng() < 0.5 ? 1 : 2 + Math.floor(rng() * 4);
      for (let m = 0; m < n && this.flock.length < DRIFT_MAX; m++) this.flock.push({ g, n, m });
    }
    this.newRun();
  }

  /** Fresh swarms for a run. The six idle pieces are dealt from the load's seed, so idle never changes between runs. */
  newRun(): void {
    ({ D: this.D, U: this.U } = makeSwarms(this.seed));
    this.throws = [];
    this.ulEnd = Infinity;
  }

  /** Swarms already run, for a saved run reopened at rest. */
  useSwarms(D: Swarm, U: Swarm, ulEnd: number): void {
    this.D = D;
    this.U = U;
    this.throws = [];
    this.ulEnd = ulEnd;
  }

  makeSwarms(): { D: Swarm; U: Swarm } {
    return makeSwarms(this.seed);
  }

  layout(W: number, H: number, dpr: number, S: number, cam: { run: Cam; idle: Cam }): void {
    this.W = W;
    this.H = H;
    env.S = S;
    env.CAM = S * 2.6;
    this.cam = cam;
    this.far = Math.hypot(Math.max(cam.run.cx, W - cam.run.cx), Math.max(cam.run.cy, H - cam.run.cy));
    this.farIdle = Math.hypot(Math.max(cam.idle.cx, W - cam.idle.cx), Math.max(cam.idle.cy, H - cam.idle.cy));
    this.r.resize(W, H, dpr);
    this.D.prepareSettle();
    this.U.prepareSettle();
  }

  // Where a piece's centre falls on screen, from the eye, in scene units: its
  // orbit, its offset and the perspective, as the shader places it (before
  // the hand's parallax).
  private screenAt(o: Pose): { x: number; y: number; z: number } {
    const cO = Math.cos(o.Om);
    const sO = Math.sin(o.Om);
    const ci = Math.cos(o.incl);
    const si = Math.sin(o.incl);
    const ca = Math.cos(o.th);
    const sa = Math.sin(o.th);
    const off = o.off;
    let px = o.r * (ca * cO - sa * sO * ci);
    let py = o.r * (ca * sO + sa * cO * ci);
    let pz = o.r * sa * si;
    if (off) {
      px += off[0];
      py += off[1];
      pz += off[2];
    }
    const sc = env.CAM / (env.CAM - pz);
    return { x: px * sc, y: py * sc, z: pz };
  }

  // Start clears idle like a magnet repelling the boomerangs: one shockwave,
  // the reward's lens, leaves Start's rim already moving and slows on the
  // sine ease-out as it runs out past the farthest corner. Each piece starts
  // to move as the front comes within reach and rides just ahead of it, so
  // the wave carries it off the screen. The push follows the front smoothly
  // (a softplus of how far the front has come past the piece), so no piece
  // jumps, and nothing grows or brightens. In idle screen pixels.
  private blastR(t: number): number {
    const S = env.S;
    const z = this.cam.idle.zoom;
    return lerp(0.35 * START_SWELL * S * z, this.farIdle + 0.3 * S * z, Math.sin((Math.PI / 2) * span(t - BLAST_AT, 0, BLAST_DUR)));
  }

  private blastW(): number {
    return env.S * 0.055 * this.cam.idle.zoom;
  }

  /** (dx, dy) is a piece's offset from Start's centre in px, y up. Leaves the push in swp and returns how much of the piece is left. */
  private blastOut(dx: number, dy: number, t: number): number {
    const d = Math.hypot(dx, dy) || 1e-3;
    const c = 0.08 * env.S * this.cam.idle.zoom;
    const lead = 0.6 * this.blastW();
    const soft = (x: number) => (x > 0 ? x + c * Math.log1p(Math.exp(-x / c)) : c * Math.log1p(Math.exp(x / c)));
    const push = soft(this.blastR(t) + lead - d) - soft(this.blastR(0) + lead - d);
    this.swp.x = (dx / d) * push;
    this.swp.y = (dy / d) * push;
    return 1 - smooth(CLEAR - CLEAR_FADE, CLEAR, t);
  }

  /** An idle piece the blast is carrying off: where it is on screen as the camera moves, and its push. */
  private blow = (o: Pose, t: number): number => {
    if (t >= CLEAR) return 0;
    const sp = this.screenAt(o);
    const k = runCam(t);
    const { idle, run } = this.cam;
    const zoom = lerp(idle.zoom, 1, k);
    const dx = lerp(idle.cx, run.cx, k) - idle.cx + sp.x * zoom;
    const dy = idle.cy - lerp(idle.cy, run.cy, k) + sp.y * zoom;
    const a = this.blastOut(dx, dy, t);
    o.sx = this.swp.x / zoom;
    o.sy = this.swp.y / zoom;
    return a;
  };

  private handPush(o: Pose): [number, number, number] {
    const out = this.hp;
    if (o.id < 0) {
      out[0] = out[1] = out[2] = 0;
      return out;
    }
    const HU = this.hu;
    const s = this.pushState[o.id];
    if (s.tag !== o.tag) {
      s.tag = o.tag;
      s.x = s.y = s.a = s.vx = s.vy = s.va = 0;
    }
    let gx = 0;
    let gy = 0;
    let ga = 0;
    const w = o.w * HU.k;
    const wt = o.w * HU.tilt;
    const wl = o.w * HU.lean;
    if (w > 0.001 || wt > 0.001 || wl > 0.001) {
      // Where the piece's centre falls on screen, with the parallax, as the shader places it.
      const p = this.screenAt(o);
      const CAM = env.CAM;
      const sc = CAM / (CAM - p.z);
      const pl = 0.16 * clamp(p.z, -0.19 * CAM, 0.19 * CAM);
      const bx = p.x + HU.x * o.w * pl * sc;
      const by = p.y + HU.y * o.w * pl * sc;
      if (w > 0.001) {
        const dx = bx + s.x - HU.cx;
        const dy = by + s.y - HU.cy;
        const d = Math.hypot(dx, dy) || 1e-3;
        const x = d / HU.reach;
        const f = x < 1 ? (1 - x * x) * (1 - x * x) : 0;
        gx = (dx / d) * f * w * HU.push;
        gy = (dy / d) * f * w * HU.push;
        ga = 0.8 * f * w;
      }
      if (wt > 0.001) {
        const near = 0.55 + 0.9 * smooth(-0.5, 0.42, p.z / CAM);
        gx += (HU.x * near * TILT_PUSH * env.S * wt) / HU.zoom;
        gy += (HU.y * near * TILT_PUSH * env.S * wt) / HU.zoom;
        ga += 0.5 * Math.hypot(HU.x, HU.y) * near * wt;
      }
      if (wl > 0.001) {
        // From the piece's own place, not where the lean has taken it, so it settles.
        const dx = bx - HU.sx;
        const dy = by - HU.sy;
        const d = Math.hypot(dx, dy) || 1e-3;
        const x = (d / HU.disc - LEAN_AT) / LEAN_W;
        const f = Math.abs(x) < 1 ? (1 - x * x) * (1 - x * x) : 0;
        gx -= (dx / d) * f * wl * LEAN_PULL * HU.disc;
        gy -= (dy / d) * f * wl * LEAN_PULL * HU.disc;
        ga += 0.25 * f * wl;
      }
    }
    const dt = HU.dt;
    const T = gx * gx + gy * gy > s.x * s.x + s.y * s.y ? PUSH_OUT : PUSH_BACK;
    [s.x, s.vx] = damp(s.x, s.vx, gx, T, dt);
    [s.y, s.vy] = damp(s.y, s.vy, gy, T, dt);
    [s.a, s.va] = damp(s.a, s.va, ga, ga > s.a ? PUSH_OUT : PUSH_BACK, dt);
    out[0] = s.x;
    out[1] = s.y;
    out[2] = s.a;
    return out;
  }

  private put(o: Pose, col: RGB, shade: number, alpha: number, heat: number): void {
    if (alpha <= 0.003) return;
    this.r.piece(o, col, shade, alpha, heat, this.handPush(o));
  }

  // Rewards take the strongest one in play rather than adding up, since
  // milestones can come a tenth of a second apart.
  private rewardLook(sw: Swarm, t: number): { flash: number; heat: number; shake: number } {
    const o = { flash: 0, heat: 0, shake: 0 };
    for (const r of sw.rewards) {
      const tau = t - r.t;
      if (tau < 0 || tau > 2.5) continue;
      const L = r.level;
      const att = EASE_OUT(tau / 0.06);
      o.flash = Math.max(o.flash, (0.1 + 0.05 * L) * att * Math.exp(-tau / (0.3 + 0.05 * L)));
      o.heat = Math.max(o.heat, 0.12 * L * att * Math.exp(-tau / 0.5));
      if (L > 2) o.shake = Math.max(o.shake, env.S * 0.007 * (L - 2) * att * Math.exp(-tau / 0.22));
    }
    return o;
  }

  private buildSwarm(sw: Swarm, t: number, gf: number): void {
    if (!sw.o.seeds && t < sw.t0) return;
    const isLive = t < sw.t1;
    const te = Math.min(t, sw.t1 - 1e-4);
    const n = sw.joinedAt(te);
    const xE = sw.x(te);
    const rw = this.rewardLook(sw, t);
    const tau = t - sw.t1;
    // Everything that only belongs to a live swarm fades out as it exits.
    const liveK = isLive ? 1 : 1 - sw.exitOf(tau);
    const bright = (isLive ? sw.liveBright(t) : sw.restBright(t, this.ulEnd)) * (1 + rw.flash);
    // The idle pieces keep their colours while they clear and come back in download's.
    const idleCol = sw === this.D && t < sw.t0;
    // Past a few hundred megabits a wave of light spins round the swarm in
    // three spiral bands: pieces in a band are lit and swell, the rest sit back.
    const wv = smooth(1.9, 3.4, xE) * liveK;
    // After the phase the bands slow with the swarm as they fade.
    const tb = isLive ? t : sw.t1 + glide(0, 1, 0.5 * sw.o.T, sw.o.T, tau);
    const glint = t > this.ulEnd ? smooth(this.ulEnd + 0.8, this.ulEnd + 2.0, t) : 0;
    const A = this.A;
    const S = env.S;
    for (let i = 0; i < n; i++) {
      if (!(isLive ? sw.live(i, t, A, this.blow) : sw.settle(i, t, A)) || A.alpha <= 0.003) continue;
      A.r += A.jr;
      let shade = bright * A.shade;
      let h = rw.heat;
      let grow = 1;
      if (wv > 0) {
        const psi = 3 * (A.th + A.Om) + sw.o.dir * (A.r / S) * 9 - sw.o.dir * tb * 3.6;
        const band = Math.pow(0.5 + 0.5 * Math.cos(psi), 3);
        shade *= lerp(1, 0.45 + 0.55 * band, wv);
        h += 0.5 * band * wv;
        grow = lerp(1, 0.85 + 0.35 * band, wv);
      }
      const st = sw.st[i];
      if (glint > 0 && st) {
        // A slow glint travels round each resting band.
        const g = glint * Math.pow(Math.max(0, Math.cos(st.slot - sw.o.dir * 0.45 * (t - this.ulEnd) - 0.6)), 14);
        shade *= 1 + 0.4 * g;
        h += 0.5 * g;
      }
      A.size *= grow;
      const col = i < sw.o.seeds && idleCol ? IDLE_COL[i] : sw.pc[i];
      this.put(A, col, shade, A.alpha * gf, h);
    }
  }

  // Storm sparks: pieces thrown off the vortex as the rate nears 10 Gbps, each
  // in the colour of the moment it was thrown. After the phase the slowing
  // vortex throws ever fewer and slower ones as its shake rings down.
  private buildStormSparks(sw: Swarm, t: number, gf: number): void {
    if (t < sw.t0 || t > sw.t1 + RING_END + 0.8) return;
    const S = env.S;
    const seed = sw.o.seed;
    for (let j = 0; j < 260; j++) {
      const h1 = hash(j, 101 + seed);
      const h2 = hash(j, 202 + seed);
      const per = 0.45 + 0.35 * h1;
      const u = (t - sw.t0) / per + h2;
      const c = Math.floor(u);
      const tau = (u - c) * per;
      const tb = t - tau;
      if (tb < sw.t0 || tb >= sw.t1 + RING_END) continue;
      const xb = sw.x(Math.min(tb, sw.t1 - 1e-4));
      const after = Math.max(0, tb - sw.t1);
      if (hash(j * 31 + 7, c + seed * 977) > 0.95 * smooth(3.2, 3.95, xb) * ringDown(after)) continue;
      const slow = 1 - 0.6 * (1 - ringDown(after));
      const a = hash(j, c * 3 + 1) * TAU;
      const rb = S * (0.5 + 0.3 * hash(j, c * 3 + 2));
      const vr = S * (0.9 + 1.8 * hash(j, c * 3 + 3)) * slow;
      const vt = sw.o.dir * rb * Math.min(omegaOf(xb), 9) * slow;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const at = (tt: number) => [rb * ca + tt * (vr * ca - vt * sa), rb * sa + tt * (vr * sa + vt * ca)];
      const hd = at(tau);
      const tl = at(Math.max(0, tau - 0.05));
      this.r.spark(hd[0], hd[1], tl[0], tl[1], rampCol(sw.o.dir, xb), Math.pow(1 - tau / per, 1.3) * 0.5 * gf, 0.9);
    }
  }

  private buildRewards(sw: Swarm, t: number, gf: number): void {
    const S = env.S;
    const seed = sw.o.seed;
    for (const r of sw.rewards) {
      const tau = t - r.t;
      if (tau < 0 || tau > 2.2) continue;
      const L = r.level;
      const col = mixc(sw.o.acc, [1, 1, 1], 0.15 + 0.08 * L);
      const nS = Math.round(lerp(SPARKS[0], SPARKS[1], r.s));
      for (let k = 0; k < nS; k++) {
        const life = (0.55 + 0.1 * L) * (0.7 + 0.6 * hash(k, 5 + seed + L));
        if (tau > life) continue;
        const a = (TAU * k) / nS + 0.4 * hash(k, 6 + seed + L);
        const v = S * (0.5 + 0.4 * L) * (0.5 + hash(k, 7 + seed + L));
        const r0 = S * 0.46;
        const at = (tt: number) => {
          const d = v * 0.32 * (1 - Math.exp(-tt / 0.32));
          const aa = a + sw.o.dir * 0.6 * (1 - Math.exp(-tt / 0.3));
          return [(r0 + d) * Math.cos(aa), (r0 + d) * Math.sin(aa)];
        };
        const hd = at(tau);
        const tl = at(Math.max(0, tau - 0.06));
        this.r.spark(hd[0], hd[1], tl[0], tl[1], col, Math.pow(1 - tau / life, 2) * (0.45 + 0.06 * L) * gf, 0.8 + 0.08 * L);
      }
    }
  }

  // Each reward sends out one shockwave that bends the scene as it passes.
  // Every wave leaves the eye already moving and runs the same course, so
  // waves thrown back to back keep their spacing; each swells in softly over
  // the first eighth of its life and leaves the screen fully faded. The
  // newest are kept if more are in flight than the lens takes.
  private buildWaves(sw: Swarm, t: number, gf: number, zoom: number): void {
    const S = env.S;
    for (let i = sw.rewards.length - 1; i >= 0; i--) {
      const r = sw.rewards[i];
      const u = (t - r.t) / lerp(WAVE_DUR[0], WAVE_DUR[1], r.s);
      if (u <= 0 || u >= 1) continue;
      const col = mixc(sw.o.acc, [1, 1, 1], 0.15 + 0.08 * r.level);
      const w = S * lerp(0.055, 0.065, r.s) * zoom;
      const R = lerp(S * 0.46 * zoom, this.far + 2.6 * w, Math.sin((u * Math.PI) / 2));
      const fade = EASE_IN_OUT_SINE(u / 0.12) * (1 - EASE_IN_OUT_SINE(span(u, 0.12, 1)));
      this.r.wave(R, w, S * 0.028 * zoom, lerp(1, 1.5, r.s) * fade * gf, col);
    }
  }

  /** Start's own lens wave, the same as a first reward's, in neutral light. */
  private buildBlast(t: number): void {
    const u = (t - BLAST_AT) / BLAST_DUR;
    if (u <= 0 || u >= 1) return;
    const fade = EASE_IN_OUT_SINE(u / 0.12) * (1 - EASE_IN_OUT_SINE(span(u, 0.12, 1)));
    this.r.wave(this.blastR(t), this.blastW(), env.S * 0.028 * this.cam.idle.zoom, fade, NEUTRAL);
  }

  // Ping: each throw draws its path behind it, fading with age and gone
  // before the next leaves; the boomerang banks most round the far turn and
  // spins fastest off the hand, and stays visible until the catch itself.
  private buildPing(t: number, gf: number): void {
    const S = env.S;
    const C = this.C;
    for (let i = 0; i < this.throws.length; i++) {
      const t0 = this.throws[i];
      const u = (t - t0) / FLY;
      if (u <= 0 || t > t0 + FLY + 0.5) continue;
      const d = pingFlown(Math.min(u, 1));
      const N = 64;
      let px = 0;
      let py = 0;
      for (let k = 0; k <= N; k++) {
        const dk = (d * k) / N;
        const [r, th] = pingAt(i, dk);
        const x = S * r * Math.cos(th);
        const y = S * r * Math.sin(th);
        const fade = Math.exp(-(t - t0 - pingTimeOf(dk) * FLY) / 0.45) * (1 - smooth(t0 + FLY, t0 + TRIP, t));
        if (k) this.r.spark(x, y, px, py, NEUTRAL, 0.45 * fade * gf, 0.5, true);
        px = x;
        py = y;
      }
      if (u < 1) {
        const [r, th] = pingAt(i, d);
        C.th = th;
        C.r = S * r;
        C.incl = 0;
        C.Om = 0;
        C.bank = 1.0 + 0.4 * Math.sin(Math.PI * d);
        C.spin = th + PING_SPIN * TAU * (1 - (1 - u) * (1 - u));
        C.size = S * 0.075;
        C.w = 0;
        C.id = -1;
        C.sx = 0;
        C.sy = 0;
        C.off = undefined;
        this.put(C, NEUTRAL, 1, smooth(0, 0.05, u) * (1 - smooth(0.95, 1, u)) * gf, 0);
      }
    }
  }

  // Idle drift: boomerangs fly real boomerang paths all over the screen, in
  // slow motion and at random. Each is thrown on a wide loop in a plane tilted
  // well out of the screen, so its flight comes toward the camera and goes
  // away again, the loop tightening and laying over as it returns. Coming
  // closer a piece grows, brightens and blurs; going away it shrinks, dims and
  // blurs the other way. About half fly alone and the rest in loose flocks.
  // They pass behind Start. On Start its shockwave blows them off the screen.
  private buildDrift(clock: number, gf: number, clear: number, v: SceneFrame): void {
    const { W, H } = this;
    const S = env.S;
    const n = Math.round(clamp((W * H) / 8500, 28, DRIFT_MAX));
    const ci = this.cam.idle;
    const DR = this.DR;
    const off: [number, number, number] = [0, 0, 0];
    const salt = this.salt;
    for (let j = 0; j < n; j++) {
      const { g, m } = this.flock[j];
      // A flock shares one flight; each flight it is thrown somewhere new.
      const life = 13 + 10 * hash(g, 401 + salt);
      const u0 = clock / life + hash(g, 402 + salt);
      const c = Math.floor(u0);
      const u = u0 - c;
      const hg = (q: number) => hash(g * 16 + q, c * 7919 + 403 + salt);
      const hm = (q: number) => hash(j * 16 + q, c * 7919 + 409 + salt);
      const R = S * (0.34 + 0.42 * hg(4)) * (0.94 + 0.12 * hm(4));
      const tilt = (0.6 + 0.45 * hg(7)) * (hg(3) < 0.5 ? -1 : 1);
      const turn = hg(8) < 0.5 ? -1 : 1;
      const reach = R * Math.abs(Math.sin(tilt));
      const zc = clamp(S * (-0.9 + 1.4 * hg(1)), -1.25 * S + reach, 1.05 * S - reach);
      const lead = 0.05 * (hm(7) - 0.5);
      const uu = clamp(u + lead, 0, 1);
      const sweep = TAU * 0.82;
      DR.r = R * (1 - 0.22 * uu) * (1 + 0.07 * m);
      DR.incl = tilt * (1 - 0.3 * uu);
      DR.Om = hg(2) * TAU + turn * 0.5 * uu;
      DR.th = hg(9) * TAU + turn * (sweep * (1.3 * uu - 0.3 * uu * uu) - 0.42 * m);
      // The disc leans in toward the loop's centre as it is thrown and lays over flat as it returns.
      DR.bank = 0.8 + 0.6 * uu + 0.1 * Math.sin(1.3 * clock + hm(14) * TAU);
      off[0] = (hg(5) * W - ci.cx) / ci.zoom + 30 * (hm(5) - 0.5);
      off[1] = (ci.cy - hg(6) * H) / ci.zoom + 30 * (hm(6) - 0.5);
      off[2] = zc;
      DR.off = off;
      const p = this.screenAt(DR);
      const z = p.z;
      let sx = ci.cx + p.x * ci.zoom;
      let sy = ci.cy - p.y * ci.zoom;
      let a = EASE_IN_OUT_SINE(uu / 0.16) * EASE_IN_OUT_SINE((1 - uu) / 0.16);
      if (clear >= 0) {
        a *= this.blastOut(sx - ci.cx, ci.cy - sy, clear);
        sx += this.swp.x;
        sy -= this.swp.y;
      }
      a *= gf;
      if (a <= 0.003) continue;
      // The field stays put on screen while the camera moves into the run, so
      // its zooming out never brings new pieces in at the edges.
      const sc = env.CAM / (env.CAM - z);
      DR.r = 0;
      off[0] = (sx - v.cx) / v.zoom / sc;
      off[1] = (v.cy - sy) / v.zoom / sc;
      off[2] = z;
      const spinRate = (1.1 + 0.9 * hm(10)) * (hm(11) < 0.5 ? 1 : -1);
      DR.spin = hm(15) * TAU + spinRate * clock;
      DR.size = (S * 0.062 * (0.82 + 0.36 * hm(8)) * ci.zoom) / v.zoom;
      DR.w = 1;
      DR.id = 8 + j;
      DR.tag = c;
      DR.sx = 0;
      DR.sy = 0;
      // A flock mostly shares a colour; now and then one member differs.
      const col = DRIFT_COL[Math.floor((hm(12) < 0.2 ? hm(3) : hg(12)) * 3)];
      this.put(DR, col, 1, a, 0);
    }
  }

  /** The storm shakes the scene; after its phase the shake rings down and slows. */
  private shakeAt(t: number): [number, number] {
    if (env.reduced) return [0, 0];
    let x = 0;
    let y = 0;
    for (const sw of [this.D, this.U]) {
      if (t < sw.t0) continue;
      const amp = env.S * 0.016 * stormOf(sw.x(Math.min(t, sw.t1 - 1e-4))) * ringDown(t - sw.t1) + this.rewardLook(sw, t).shake;
      const tc = calmTime(sw.t1, t);
      x += amp * (0.6 * Math.sin(tc * 61.3) + 0.4 * Math.sin(tc * 37.1 + 1.3));
      y += amp * (0.6 * Math.sin(tc * 53.7 + 0.7) + 0.4 * Math.sin(tc * 41.9 + 2.1));
    }
    return [x, y];
  }

  /** One frame. The camera (zoom and centre) is what moves the swarm between the idle and run layouts. */
  frame(v: SceneFrame): void {
    const r = this.r;
    const S = env.S;
    const { W, H } = this;
    r.begin();
    if (v.run) {
      this.D.advance(v.t);
      this.U.advance(v.t);
    }
    // The hand, in the scene's units: the parallax, the cursor that repels,
    // and Start, toward which a resting cursor draws the nearest pieces.
    const HU = this.hu;
    const hk = v.handK;
    const ci = this.cam.idle;
    HU.lean = v.lean;
    HU.x = v.hand.x * hk;
    HU.y = v.hand.y * hk;
    HU.k = v.hand.mouseOn * hk * (1 - HU.lean);
    HU.cx = (v.hand.rx - v.cx) / v.zoom;
    HU.cy = (v.cy - v.hand.ry) / v.zoom;
    HU.sx = (v.startX - v.cx) / v.zoom;
    HU.sy = (v.cy - v.startY) / v.zoom;
    HU.disc = (0.35 * S * ci.zoom) / v.zoom;
    HU.reach = (REPEL_R * S * ci.zoom) / v.zoom;
    HU.push = REPEL_PUSH * HU.reach;
    HU.tilt = v.hand.tilt && !v.hand.mouse ? 1 : 0;
    HU.zoom = v.zoom / ci.zoom;
    HU.dt = v.hand.dt;
    let sh: [number, number] = [0, 0];
    if (v.run && v.runGf > 0.001) {
      const t = v.t;
      const gf = v.runGf;
      env.TW = v.runTW;
      this.buildSwarm(this.D, t, gf);
      this.buildSwarm(this.U, t, gf);
      this.buildStormSparks(this.D, t, gf);
      this.buildStormSparks(this.U, t, gf);
      this.buildRewards(this.D, t, gf);
      this.buildRewards(this.U, t, gf);
      this.buildBlast(t);
      this.buildWaves(this.D, t, gf, v.zoom);
      this.buildWaves(this.U, t, gf, v.zoom);
      this.buildPing(t, gf);
      sh = this.shakeAt(t);
    }
    if (v.idleGf > 0.001) {
      env.TW = v.idleTW;
      this.buildSwarm(this.D, 0, v.idleGf);
    }
    if (v.drift) this.buildDrift(v.drift.clock, v.drift.gf, v.drift.clear, v);
    const off: [number, number] = [sh[0] * v.zoom + (v.cx - W / 2), sh[1] * v.zoom + (H / 2 - v.cy)];
    const dpr = r.dpr;
    // Depth of field only while idle pieces are on screen; the most blur
    // scales with the scene, a few pixels either way.
    const dofR = r.idleDrawn ? clamp(0.03 * S * v.zoom, 4, 9) * dpr : 0;
    // The shockwaves, about the eye as the shake carries it; Start's, which
    // is over long before the first reward, about where Start was pressed.
    const waveC: [number, number] =
      v.run && v.t < BLAST_AT + BLAST_DUR
        ? [ci.cx * dpr, (H - ci.cy) * dpr]
        : [(v.cx + sh[0] * v.zoom) * dpr, (H - v.cy + sh[1] * v.zoom) * dpr];
    const c: Composite = {
      boxes: v.boxes,
      boxK: v.boxK,
      eye: [v.eyeX * dpr, (H - v.eyeY) * dpr, v.eyeR * dpr, v.eyeK],
      dofR,
      waveC,
    };
    r.draw(W, H, off, v.zoom, env.CAM, [HU.x, HU.y], c);
  }
}
