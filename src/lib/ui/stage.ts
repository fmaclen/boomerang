// The stage keeps the run's clock and its life (start, the way home, a past
// run reopened and put back) and drives the scene, frame by frame. Each frame
// is a function of the run's clock (seconds since Start) and, on the way home,
// of the seconds since New test, so nothing depends on how often frames come.
// Components that move with the run subscribe to its frames and write their
// own markup (the eye, Start, the instruments); every other move is CSS, keyed
// on the state this sets (see state.svelte.ts and app.css).

import { prepareRun } from '../engine';
import type { RunData } from '../run/data';
import { LiveRun } from '../run/live';
import { EXIT_END, RES_MOVE } from '../run/timing';
import { Scene, runCam, type Cam } from '../scene';
import { EASE_DRAWER, EASE_IN_OUT, EASE_IN_OUT_SINE, EASE_OUT, lerp, span } from '../scene/math';
import { env, makeSwarms, type Swarm } from '../scene/swarm';
import { Hand } from './hand';
import { ui, type Beat } from './state.svelte';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The scene's crossfade into a reopened run, and back out of it. */
const RV_IN = 0.34;
const RV_OUT = 0.32;

const secs = () => performance.now() / 1000;

/** One frame, as a subscriber sees it: the time, the run's clock and the way home's, and the run on screen. */
export interface Frame {
  now: number;
  t: number;
  e: number;
  data: RunData | null;
}

const subscribers = new Set<(f: Frame) => void>();

/** Calls fn every frame, from whenever the stage starts, until the returned function is called. */
export function onFrame(fn: (f: Frame) => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export class Stage {
  readonly scene: Scene | null;
  readonly seed = (Math.random() * 0x7fffffff) | 0;
  readonly reduced = REDUCED;
  /** The run on screen: live, or a saved one reopened. */
  data: RunData | null = null;
  /** How far a resting cursor on Start draws the nearest pieces in (see the home page). */
  lean = 0;
  /** Called with a finished run's id once it is saved. */
  onSaved: (id: string) => void = () => {};
  private clock = { idleAt: secs(), runAt: 0, exitAt: 0, runTW: 0, firstIdle: true };
  private live: LiveRun | null = null;
  private replay = false;
  /** The scene's crossfade into the reopened run: from a, to b, from at over dur. */
  private fade = { a: 0, b: 0, at: 0, dur: 0 };
  /** The next run's swarms, made while idle (see ready). */
  private nextSwarms: { D: Swarm; U: Swarm } | null = null;
  private hand = new Hand(REDUCED);
  /** The cameras in the app's own box, and the scene's in the window, which follow the page as it scrolls. */
  private camApp: { run: Cam; idle: Cam } = { run: { zoom: 1, cx: 0, cy: 0 }, idle: { zoom: 1, cx: 0, cy: 0 } };
  private cam: { run: Cam; idle: Cam } = { run: { zoom: 1, cx: 0, cy: 0 }, idle: { zoom: 1, cx: 0, cy: 0 } };
  private top = NaN;
  private raf = 0;
  private visible = () => (document.hidden ? cancelAnimationFrame(this.raf) : this.go());

  constructor(
    private root: HTMLElement,
    canvas: HTMLCanvasElement,
  ) {
    this.scene = Scene.create(canvas, this.seed);
    env.reduced = REDUCED;
    // No frames for a hidden tab; the run's clock carries on regardless.
    document.addEventListener('visibilitychange', this.visible);
    this.go();
    this.ready();
  }

  /**
   * Makes the next run's swarms and starts its worker while the page is
   * idle, so the press of Start only sets them going and the first frames
   * of its exit carry nothing else.
   */
  private ready(): void {
    this.nextSwarms ??= makeSwarms(this.seed);
    prepareRun();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.visible);
    this.live?.abort();
    this.hand.destroy();
  }

  /** The swarm's size and its cameras in the app's box (see the root layout), with the box top px down the window. */
  place(S: number, cams: { run: Cam; idle: Cam }, top: number): void {
    this.camApp = cams;
    this.top = NaN;
    this.follow(top);
    this.scene?.layout(innerWidth, innerHeight, devicePixelRatio || 1, S, this.cam);
  }

  private follow(top: number): void {
    if (top === this.top) return;
    this.top = top;
    const at = (c: Cam): Cam => ({ ...c, cy: c.cy + top });
    this.cam.run = at(this.camApp.run);
    this.cam.idle = at(this.camApp.idle);
  }

  // ---------------------------------------------------------------------------
  // The run's life

  /** Start: a run begins, on the run's clock from now. */
  start(): void {
    if (ui.screen !== 'idle' || ui.view !== 'start') return;
    const now = secs();
    this.clock.runTW = now - this.clock.idleAt;
    this.clock.runAt = now;
    Object.assign(ui, { screen: 'run', beat: 'latency', failed: '' });
    const swarms = this.nextSwarms ?? makeSwarms(this.seed);
    this.nextSwarms = null;
    this.live = new LiveRun(ui.mode, swarms, () => secs() - this.clock.runAt, (id) => this.onSaved(id));
    this.use(this.live.data);
  }

  /** The id of the live run's result, once it has one. */
  get liveId(): string | undefined {
    return this.live ? this.data?.result?.id : undefined;
  }

  /** Stop during a run, New test after it, or History taking the scene home under it at pace: the way home. */
  home(pace = 1): void {
    if (ui.screen !== 'run') return;
    if (this.live && !this.data?.result) this.live.abort();
    this.clock.exitAt = secs();
    Object.assign(ui, { screen: 'exit', pace });
  }

  /** Try again, after a failed run: a fresh run, from now. */
  retry(): void {
    if (!ui.failed) return;
    this.toIdle();
    this.start();
  }

  /** A saved run, shown as a result at rest on its own clock, the scene gliding in from idle. */
  showReplay(data: RunData): void {
    this.live?.abort();
    this.live = null;
    this.replay = true;
    this.use(data);
    this.clock.runAt = secs() - data.restAt;
    this.clock.runTW = 0;
    ui.screen = 'run';
    this.fadeTo(1, RV_IN);
  }

  /** A reopened run eases back under the list; idle takes over once it has. */
  putBack(): void {
    if (this.replay && ui.screen === 'run') this.fadeTo(0, RV_OUT);
  }

  /** Nothing on screen, at once: idle carries on. */
  toIdle(): void {
    this.live?.abort();
    Object.assign(ui, { screen: 'idle', pace: 1, beat: 'idle', failed: '' });
    this.clock.firstIdle = false;
    this.data = null;
    this.live = null;
    this.replay = false;
    this.fade = { a: 0, b: 0, at: 0, dur: 0 };
    this.ready();
  }

  private use(data: RunData): void {
    this.data = data;
    this.scene?.useSwarms(data.D, data.U, data.P.ulEnd);
    if (this.scene) this.scene.throws = data.throws;
  }

  private rv(now: number): number {
    const f = this.fade;
    return this.replay ? lerp(f.a, f.b, EASE_IN_OUT_SINE(span(now - f.at, 0, f.dur))) : 1;
  }

  private fadeTo(b: number, dur: number): void {
    const now = secs();
    this.fade = { a: this.rv(now), b, at: now, dur };
  }

  /** Where the run on screen is at run time t. */
  private beat(t: number): Beat {
    const d = this.data!;
    const P = d.P;
    if (t >= P.r0 + Math.max(RES_MOVE, 1.7)) return 'settled';
    if (t >= P.r0) return 'formed';
    if (d.result) return 'measured';
    return t < P.dl ? 'latency' : t < P.ul ? 'download' : 'upload';
  }

  // ---------------------------------------------------------------------------
  // The frame

  private go(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    // The first frame the stage places; the measurement of first load reads it.
    document.documentElement.dataset.drawn = '';
    const now = secs();
    // Under the list the scene stays still while the page scrolls.
    if (ui.view !== 'list') this.follow(this.root.getBoundingClientRect().top);
    const clock = this.clock;
    const e = (now - clock.exitAt) * ui.pace;
    if (ui.screen === 'exit' && e >= EXIT_END) {
      clock.idleAt = clock.exitAt;
      this.toIdle();
    }
    if (this.replay && ui.screen === 'run' && this.fade.b === 0 && now - this.fade.at >= this.fade.dur) this.toIdle();
    const t = ui.screen === 'idle' ? 0 : now - clock.runAt;
    const data = this.data;
    if (ui.screen === 'run' && this.live) this.live.tick(t);
    if (data && ui.screen !== 'idle') {
      ui.beat = this.beat(t);
      ui.failed = t >= data.failedAt ? data.reason || 'The run failed' : '';
    }
    const f = { now, t, e, data };
    for (const fn of subscribers) fn(f);
    this.hand.ease(now);
    this.drawScene(now, t, e);
  };

  private drawScene(now: number, t: number, e: number): void {
    const scene = this.scene;
    if (!scene) return;
    const run = ui.screen !== 'idle';
    // A failed run's swarm goes home the way New test takes it, from the
    // moment it failed, while the page says why and offers to try again.
    const failedAt = ui.screen === 'run' && ui.failed ? this.data!.failedAt : Infinity;
    const exit = ui.screen === 'exit' || t >= failedAt;
    if (ui.screen === 'run' && exit) e = t - failedAt;
    const reopened = this.replay && ui.screen === 'run';
    const rv = reopened ? this.rv(now) : 1;
    const d = this.data;
    if (d) scene.ulEnd = d.P.ulEnd;
    // The camera: 0 is the idle layout, 1 the run's.
    let k = run ? runCam(t) * rv : 0;
    if (exit) k *= 1 - EASE_IN_OUT(span(e, 0, 0.6));
    const { idle, run: rc } = this.cam;
    let idleClock = run ? (exit ? now - (ui.screen === 'exit' ? this.clock.exitAt : this.clock.runAt + failedAt) : 0) : now - this.clock.idleAt;
    let idleGf = 0;
    if (!run) idleGf = this.clock.firstIdle ? EASE_OUT(span(idleClock, 0, 0.6)) : 1;
    else if (exit) idleGf = EASE_OUT(span(e, 0.15, 0.6));
    // A reopened run crossfades with idle, which carries on underneath it.
    if (reopened) {
      idleClock = now - this.clock.idleAt;
      idleGf = 1 - rv;
    }
    const runTW = this.clock.runTW;
    // The drifting field: idle's own, or the one Start is clearing.
    let drift: { clock: number; gf: number; clear: number } | null = null;
    if (idleGf > 0.001) drift = { clock: idleClock, gf: idleGf, clear: -1 };
    else if (run && t < 1.15 && !reopened) drift = { clock: runTW + t, gf: 1, clear: t };
    // The boomerangs answer the hand only in idle: it lets go as a run starts and comes back on the way home.
    let handK = run ? 1 - EASE_DRAWER(span(t, 0, 1.0)) : 1;
    if (exit) handK = Math.max(handK, EASE_OUT(span(e, 0.15, 0.75)));
    if (reopened) handK = 1 - rv;
    scene.frame({
      run,
      t,
      runTW: reopened ? 0 : runTW,
      runGf: (exit ? 1 - EASE_DRAWER(span(e, 0, 0.45)) : 1) * rv,
      idleGf,
      idleTW: idleClock,
      drift,
      handK: REDUCED ? 0 : handK * this.hand.on,
      lean: REDUCED ? 0 : handK * this.lean,
      startX: idle.cx,
      startY: idle.cy,
      zoom: lerp(idle.zoom, 1, k),
      cx: lerp(idle.cx, rc.cx, k),
      cy: lerp(idle.cy, rc.cy, k),
      hand: this.hand,
    });
  }
}

/** The page's one stage. */
export const app: { stage?: Stage } = {};
