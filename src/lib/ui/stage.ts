// The stage runs the page frame by frame, but only what follows the run's
// readings: the scene, the live number's roll and glow and its glide into the
// result, Start's collapse at the press, the charts, and the keys' rims, which
// follow the hand. Like the scene, each frame is a function of the run's
// clock (seconds since Start) and, on the way home, of the seconds since New
// test, so nothing depends on how often frames come. Every other move is CSS,
// started by the state it sets (see state.svelte.ts and app.css).

import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { formatBytes, formatMs, formatRate, prepareRun, type Formatted } from '../engine';
import { RunData, type Reading } from '../run/data';
import { LiveRun } from '../run/live';
import { EXIT_END, RES_MOVE, SETTLE, START_GONE, START_SWELL, START_SWELL_T, START_THIN, THROWS } from '../run/timing';
import { Scene, runCam, type Cam } from '../scene';
import { EASE_DRAWER, EASE_IN_OUT, EASE_IN_OUT_SINE, EASE_OUT, EASE_OUT_SOFT, bump, clamp, lerp, mixc, smooth, span, type RGB } from '../scene/math';
import { PING_ANGLE, PING_MAX, PING_MIN, pingPath, pingReach } from '../scene/ping';
import { env, makeSwarms, type Swarm } from '../scene/swarm';
import { Chart } from './chart';
import { Hand, HOVER_LIFT, Hover, Rims, type KeyBox } from './hand';
import { History } from './history';
import { ui } from './state.svelte';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Reduced motion keeps the fades and drops the movement. */
const MOVE = REDUCED ? 0 : 1;
const WIDE = '(min-width: 900px) and (min-height: 560px)';
const TOUCH_T = 0.16;
const SWEEP_T = 0.9;
const LIME: RGB = [161, 255, 89];
const LIME_ACC: RGB = [198, 255, 134];
const ORANGE: RGB = [255, 122, 48];
const INK: RGB = [241, 247, 235];
const WHITE: RGB = [255, 255, 255];
const DIR_RGB = [LIME, ORANGE];
/** The swarm reaches about 0.94 S from the centre. */
const REACH = 1.88;
/**
 * The number's glow peaks GLOW_PEAK after its beat, with the pop, then
 * falls by a factor of e every GLOW_FADE seconds. The next beat puts it out
 * over GLOW_CUT as its own glow swells in.
 */
const GLOW_PEAK = 0.1;
const GLOW_FADE = 0.3;
const GLOW_CUT = 0.08;

/** How bright the number's glow is tau seconds after its beat: it swells in on the pop's own curve, then eases out. */
function glowOf(tau: number): number {
  if (tau <= 0) return 0;
  return tau <= GLOW_PEAK ? bump(tau, GLOW_PEAK) : Math.exp(-(tau - GLOW_PEAK) / GLOW_FADE);
}

/** What the eye shows at a moment: the phase, its colour, the number and its unit. */
interface EyeWords {
  label: string;
  col: RGB;
  num: string;
  dim: boolean;
  unit: string;
  dir: number;
}

/** A line of the eye: its slot, and the two spans it rolls one into the other. */
interface Slot {
  el: HTMLElement;
  spans: HTMLElement[];
}

const secs = () => performance.now() / 1000;
const css = (c: number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// Writes to the page every frame skip what has not changed.
const written = new WeakMap<HTMLElement, Record<string, string>>();
function put(n: HTMLElement, prop: string, v: string): void {
  let m = written.get(n);
  if (!m) written.set(n, (m = {}));
  if (m[prop] === v) return;
  m[prop] = v;
  if (prop === 'text') n.textContent = v;
  else if (prop.startsWith('@')) n.setAttribute(prop.slice(1), v);
  else n.style.setProperty(prop, v);
}

export class Stage {
  readonly scene: Scene | null;
  readonly seed = (Math.random() * 0x7fffffff) | 0;
  readonly history: History;
  readonly clock = { idleAt: secs(), runAt: 0, exitAt: 0, runTW: 0, firstIdle: true };
  /** The run on screen: live, or a saved one History reopened. */
  data: RunData | null = null;
  private el;
  private slots: Slot[];
  private charts: Chart[];
  private hand = new Hand(REDUCED);
  private hover = new Hover();
  private rims: Rims;
  private press = { at: -1, ang: -40, up: -1, off: -1 };
  private live: LiveRun | null = null;
  /** The next run's swarms, made while idle (see ready). */
  private nextSwarms: { D: Swarm; U: Swarm } | null = null;
  private box = { W: 0, H: 0, dpr: 1 };
  /** Where the app's box sits in the window: the scene's cameras follow it as the page scrolls, except under the list, which scrolls over a still scene. */
  private top = 0;
  private S = 200;
  private wide = false;
  /** The cameras in the app's own box, and the scene's, in the window. */
  private camApp: { run: Cam; idle: Cam } = { run: { zoom: 1, cx: 0, cy: 0 }, idle: { zoom: 1, cx: 0, cy: 0 } };
  private cam: { run: Cam; idle: Cam } = { run: { zoom: 1, cx: 0, cy: 0 }, idle: { zoom: 1, cx: 0, cy: 0 } };
  /** Per live line: [dx, dy, scale] that lands it on the result's upload line. */
  private flip: number[][] = [[0, 0, 1], [0, 0, 1], [0, 0, 1]];
  private flipChecked = false;
  /** The result whose words the result lines hold. */
  private worded: unknown = null;
  private raf = 0;
  private cleanup: (() => void)[] = [];

  constructor(
    private root: HTMLElement,
    canvas: HTMLCanvasElement,
  ) {
    this.scene = Scene.create(canvas, this.seed);
    env.reduced = REDUCED;
    this.el = {
      live: $('live'),
      result: $('result'),
      stage: $('stage'),
      dock: $('dock'),
      top: $('top'),
      charts: [$('chartD'), $('chartU')],
      statsRow: $('stats'),
      resUl: ['res-label', 'res-num', 'res-unit'].map((id) => $(id)),
      gh: $('gh'),
      menu: $('menu'),
    };
    this.slots = ['lvPhase', 'lvNum', 'lvUnit'].map((id) => ({ el: $(id), spans: [...$(id).children] as HTMLElement[] }));
    this.charts = this.el.charts.map((c) => new Chart(c.querySelector('canvas')!));
    this.rims = new Rims(['start', 'gh', 'menu', 'track', 'thumb', 'dkey']);
    this.history = new History(this);
    this.wire();
    this.layout(true);
    this.raf = requestAnimationFrame(this.frame);
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
    this.live?.abort();
    for (const off of this.cleanup) off();
  }

  private on(target: EventTarget, type: string, fn: (ev: never) => void): void {
    target.addEventListener(type, fn as EventListener);
    this.cleanup.push(() => target.removeEventListener(type, fn as EventListener));
  }

  // ---------------------------------------------------------------------------
  // Presses

  /** A press on Start: when it went down, and where round the disc it touched, in degrees clockwise from the top. */
  pressDown(ev: PointerEvent): void {
    if (ui.screen !== 'idle') return;
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.press = { at: secs(), ang: (Math.atan2(ev.clientX - (r.left + r.width / 2), r.top + r.height / 2 - ev.clientY) * 180) / Math.PI, up: -1, off: -1 };
  }

  private wire(): void {
    // When a finger let go on Start (the click follows), and when a press
    // that slid off was let go.
    const letGo = (ev: PointerEvent) => {
      const p = this.press;
      const start = $('start');
      if (p.at < 0 || p.off >= 0 || ui.screen !== 'idle' || !start) return;
      const r = start.getBoundingClientRect();
      const inside = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2)) <= r.width / 2;
      if (ev.type === 'pointerup' && inside) p.up = secs();
      else p.off = secs();
    };
    this.on(window, 'pointerup', letGo);
    this.on(window, 'pointercancel', letGo);
    this.on(window, 'resize', () => this.layout());
    // A press sweeps the light once round the rim of the key it lands on.
    this.on(document, 'pointerdown', (ev: PointerEvent) => {
      if (REDUCED) return;
      const key = (ev.target as Element).closest?.('[data-kick]');
      const rim = key && (key.getAttribute('data-kick') ? $(key.getAttribute('data-kick')!) : (key as HTMLElement));
      if (!rim) return;
      rim.classList.remove('kick');
      void rim.offsetWidth;
      rim.classList.add('kick');
    });
    this.on(document, 'animationend', (ev: AnimationEvent) => {
      if (ev.animationName === 'rim-sweep') (ev.target as HTMLElement).classList.remove('kick');
    });
  }

  pressStart(): void {
    if (ui.screen !== 'idle' || ui.open) return;
    const now = secs();
    // A start with no press on the disc (a key) lights from now.
    if (this.press.at < 0 || this.press.off >= 0) this.press = { at: now, ang: -40, up: -1, off: -1 };
    this.press.off = -1;
    this.clock.runTW = now - this.clock.idleAt;
    this.clock.runAt = now;
    ui.screen = 'run';
    const swarms = this.nextSwarms ?? makeSwarms(this.seed);
    this.nextSwarms = null;
    this.live = new LiveRun(ui.mode, swarms, () => secs() - this.clock.runAt, (id) => this.saved(id));
    this.useRun(this.live.data);
  }

  /** Puts a run on screen: its swarms in the scene and its words in the result. */
  useRun(data: RunData): void {
    this.data = data;
    this.scene?.useSwarms(data.D, data.U, data.P.ulEnd);
    if (this.scene) this.scene.throws = data.throws;
    for (const c of this.charts) c.reset();
    ui.stats = [0, 0, 0].map(() => ({ value: '', unit: '', lit: false }));
    this.resultWords();
  }

  /**
   * A finished run, saved, takes its own address, so it can be bookmarked,
   * reloaded and found again with Back; the screen stays as it is.
   */
  private saved(id: string): void {
    if (this.live?.data.result?.id !== id || ui.screen !== 'run' || ui.open || location.pathname !== resolve('/')) return;
    app.quiet = true;
    void goto(resolve('/history/[id]', { id }), { reset: false }).finally(() => (app.quiet = false));
  }

  /** Stop during a run, New test after it: the way home. pace runs it faster when History takes the scene home under it. */
  pressAction(pace = 1): void {
    if (ui.screen !== 'run') return;
    if (this.live && !this.data?.result) this.live.abort();
    this.clock.exitAt = secs();
    ui.pace = pace;
    ui.screen = 'exit';
    this.press.at = -1;
  }

  /** Whether the result is up (or the run failed), so History may open over it. */
  resultUp(): boolean {
    const d = this.data;
    return !!d && ui.screen === 'run' && secs() - this.clock.runAt >= Math.min(d.P.r0, d.failedAt);
  }

  /** History reopens a saved run: it is shown as a result at rest, on its own clock. */
  showReplay(data: RunData): void {
    this.live?.abort();
    this.live = null;
    this.useRun(data);
    this.clock.runAt = secs() - data.restAt;
    this.clock.runTW = 0;
    ui.screen = 'run';
    this.press.at = -1;
  }

  /** The way home has ended, or a reopened run has eased back under the list: idle carries on. */
  toIdle(): void {
    ui.screen = 'idle';
    ui.pace = 1;
    Object.assign(ui, { lit: false, formed: false, landed: false, settled: false, phase: '', dirOn: [false, false], progress: 0 });
    this.clock.firstIdle = false;
    this.data = null;
    this.live = null;
    this.ready();
  }

  // ---------------------------------------------------------------------------
  // Layout: the stage element is where the swarm goes during a run; in idle
  // the swarm also takes the band the instruments will fill. Positions are
  // in the app's own box, which the demo's bar pushes down.

  layout(force = false): void {
    const app = this.root.getBoundingClientRect();
    const W = innerWidth;
    const H = innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const b = this.box;
    if (!force && W === b.W && H === b.H && dpr === b.dpr) return;
    Object.assign(b, { W, H, dpr });
    const el = this.el;
    const rel = (n: HTMLElement) => {
      const r = n.getBoundingClientRect();
      return { left: r.left - app.left, top: r.top - app.top, right: r.right - app.left, bottom: r.bottom - app.top, width: r.width, height: r.height };
    };
    const wide = (this.wide = matchMedia(WIDE).matches);
    const st = rel(el.stage);
    const dk = rel(el.dock);
    const S = (this.S = Math.max(60, Math.min(wide ? st.width : W - 28, st.height) / REACH));
    const run = { zoom: 1, cx: W / 2, cy: st.top + st.height / 2 };
    // Idle has only Start inside the swarm, so the swarm grows into the empty
    // band between the top bar and the mode choice, centred in it.
    const bottom = dk.top - 12;
    const zi = clamp(Math.min(wide ? W : W * 1.1, bottom - st.top) / REACH / S, 1, 1.22);
    const idle = { zoom: zi, cx: W / 2, cy: (st.top + bottom) / 2 };
    this.camApp = { run, idle };
    this.top = NaN;
    this.follow(app.top);
    const vars: Record<string, string> = {
      '--s': `${S.toFixed(2)}px`,
      '--run-x': `${run.cx}px`,
      '--run-y': `${run.cy}px`,
      '--idle-x': `${idle.cx}px`,
      '--idle-y': `${idle.cy}px`,
      '--idle-z': `${zi}`,
    };
    for (const k in vars) this.root.style.setProperty(k, vars[k]);
    this.measureFlips();
    // The shade the interface casts on the scene: one box round the top bar
    // and one round the bottom key, always; the instruments' during a run,
    // one round each on a wide screen, and one round them all on a phone.
    const boxes: [string, HTMLElement[], number][] = wide
      ? [['dimTop', [el.top], 10], ['dimDock', [el.dock], 12], ['dimA', [el.charts[0]], 16], ['dimB', [el.charts[1]], 16], ['dimC', [el.statsRow], 12]]
      : [['dimTop', [el.top], 10], ['dimDock', [el.dock], 12], ['dimA', [...el.charts, el.statsRow], 12], ['dimB', [], 0], ['dimC', [], 0]];
    const keepOut = untransformed([...el.charts, el.statsRow], () =>
      boxes.flatMap(([id, els, pad]) => {
        const n = $(id);
        n.hidden = !els.length;
        if (!els.length) return [];
        const rs = els.map(rel);
        const box = [Math.min(...rs.map((r) => r.left)) - pad, Math.min(...rs.map((r) => r.top)) - pad, Math.max(...rs.map((r) => r.right)) + pad, Math.max(...rs.map((r) => r.bottom)) + pad];
        Object.assign(n.style, { left: `${box[0]}px`, top: `${box[1]}px`, width: `${box[2] - box[0]}px`, height: `${box[3] - box[1]}px` });
        return [box];
      }),
    );
    // How far each ping throw may loop out: up to PING_MAX, as long as every
    // point of the loop stays on screen and clear of the interface.
    const pad = S * 0.12 + 6;
    const roomy = (x: number, y: number) =>
      x > pad && x < W - pad && y > pad - app.top && y < H - app.top - pad && keepOut.every(([a, b, c, d]) => x < a - pad || x > c + pad || y < b - pad || y > d + pad);
    PING_ANGLE.forEach((_, j) => {
      let lo = PING_MIN;
      let hi = PING_MAX;
      for (let it = 0; it < 16; it++) {
        pingReach[j] = (lo + hi) / 2;
        let ok = true;
        for (let q = 0; q <= 60 && ok; q++) {
          const [r, th] = pingPath(j, q / 60);
          ok = roomy(run.cx + S * r * Math.cos(th), run.cy - S * r * Math.sin(th));
        }
        if (ok) lo = pingReach[j];
        else hi = pingReach[j];
      }
      pingReach[j] = lo;
    });
    this.placeWhere();
    for (const c of this.charts) c.reset();
    this.scene?.layout(W, H, dpr, S, this.cam);
  }

  /** The scene's cameras, in the window, for the app's box top px down it. */
  private follow(top: number): void {
    if (top === this.top) return;
    this.top = top;
    const at = (c: Cam): Cam => ({ ...c, cy: c.cy + top });
    this.cam.run = at(this.camApp.run);
    this.cam.idle = at(this.camApp.idle);
  }

  /**
   * A reopened run's details take the stats row's and the bottom key's band.
   * On a wide screen they start where the stats row does, across the top
   * bar's width. On a phone, across the charts' width, they end where the key
   * does, and the charts come down with them to stay the stats row's distance
   * above (--where-dy).
   */
  placeWhere(): void {
    const el = this.el;
    const where = $('where');
    if (!where) return;
    const app = this.root.getBoundingClientRect();
    const sr = untransformed([el.statsRow], () => el.statsRow.getBoundingClientRect());
    const box = (this.wide ? el.top : el.charts[0].parentElement!).getBoundingClientRect();
    const top = this.wide ? sr.top : el.dock.getBoundingClientRect().bottom - where.offsetHeight;
    where.style.left = `${box.left - app.left}px`;
    where.style.width = `${box.width}px`;
    where.style.top = `${top - app.top}px`;
    this.root.style.setProperty('--where-dy', `${top - sr.top}px`);
  }

  /** The result's words, known once the run has finished, so the move onto them can be measured. */
  private resultWords(): void {
    const result = this.data?.result;
    if (!result || result === this.worded) return;
    this.worded = result;
    const words = [formatRate(result.download.mbps), formatRate(result.upload.mbps)];
    ['D', ''].forEach((k, i) => {
      $(`res-num${k}`).textContent = words[i].value;
      $(`res-unit${k}`).textContent = words[i].unit;
    });
    this.measureFlips();
  }

  /**
   * Where each live line lands in the result, measured with the result's
   * real words. What has to land is the words, not their slot: the number's
   * line is taller than its slot and hangs below its centre, about which the
   * slot scales. So the move takes the words' own centre across and their
   * baseline down onto the result's, scaled about the slot's centre.
   */
  private measureFlips(): void {
    const el = this.el;
    const targets = [el.resUl[0], el.resUl[1], el.resUl[1]];
    const moved = [$('eye'), el.live, el.result, ...this.slots.flatMap((s) => [s.el, s.spans[0]]), ...targets];
    untransformed(moved, () =>
      this.slots.forEach((s, j) => {
        const n = s.spans[0];
        const keep = n.textContent;
        n.textContent = targets[j].textContent;
        const c = centreIn(s.el, el.live);
        const ax = centreIn(n, el.live)[0];
        const ay = baselineIn(n, el.live);
        const bx = centreIn(targets[j], el.result)[0];
        const by = baselineIn(targets[j], el.result);
        const f = parseFloat(getComputedStyle(targets[j]).fontSize) / parseFloat(getComputedStyle(n).fontSize);
        this.flip[j] = [bx - c[0] - f * (ax - c[0]), by - c[1] - f * (ay - c[1]), f];
        n.textContent = keep;
      }),
    );
    // The unit travels with the number while it fades.
    this.flip[2] = [this.flip[1][0], this.flip[1][1], 1];
    this.flipChecked = false;
  }

  // Safari also snaps each moving line to its own pixel grid, the live line
  // and the result by different amounts. So on the move's first frame, with
  // everything where it will be at the end, check where the words land and
  // take up the difference.
  private checkFlip(): void {
    this.flipChecked = true;
    [this.el.resUl[0], this.el.resUl[1]].forEach((target, j) => {
      const s = this.slots[j];
      const n = s.spans[0];
      const keep = s.el.style.transform;
      const [dx, dy, f] = this.flip[j];
      s.el.style.transform = `translate(${dx}px, ${dy}px) scale(${f})`;
      const a = n.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      this.flip[j][0] += b.left + b.width / 2 - a.left - a.width / 2;
      this.flip[j][1] += baselineAt(target) - baselineAt(n);
      s.el.style.transform = keep;
    });
    this.flip[2] = [this.flip[1][0], this.flip[1][1], 1];
  }

  // ---------------------------------------------------------------------------
  // The eye

  /** What the eye shows at run time t. */
  private eyeAt(t: number): EyeWords {
    const d = this.data!;
    if (t >= d.failedAt) return { ...this.eyeAt(d.failedAt - 1e-3), label: 'Failed', col: INK, dim: true, dir: -1 };
    if (t < d.dirs[0].t0) {
      let n = -1;
      for (let i = 0; i < d.throws.length; i++) if (t >= d.catchAt(i)) n = i;
      // Until the first catch the number waits at a greyed zero, the width of a reading.
      if (n < 0) return { label: 'Ping', col: INK, num: formatMs(0).value, dim: true, unit: 'ms', dir: -1 };
      const f = formatMs(d.catchValue(n));
      return { label: 'Ping', col: INK, num: f.value, dim: false, unit: f.unit, dir: -1 };
    }
    // Each direction takes over the eye as its phase starts, with its swarm;
    // until the meter's first reading its number waits at a greyed zero.
    const i = t < d.dirs[1].t0 ? 0 : 1;
    const dir = d.dirs[i];
    const label = i ? 'Upload' : 'Download';
    let f: Formatted;
    if (t < dir.firstAt && t < dir.t1) {
      f = formatRate(0);
      return { label, col: DIR_RGB[i], num: f.value, dim: true, unit: f.unit, dir: i };
    }
    if (t < dir.t1 || dir.final === undefined) {
      const r = dir.readingAt(t);
      f = formatRate(r?.mbps ?? 0, unitOf(r));
    } else {
      const last = dir.readings[dir.readings.length - 1];
      const settle = EASE_OUT(span(t, dir.t1, dir.t1 + SETTLE));
      f = settle >= 1 ? formatRate(dir.final) : formatRate(lerp(last?.mbps ?? dir.final, dir.final, settle), formatRate(dir.final).unit);
    }
    return { label, col: DIR_RGB[i], num: f.value, dim: false, unit: f.unit, dir: i };
  }

  private popAt(t: number): { scale: number; heat: number; unit: number } {
    const d = this.data!;
    let scale = 0;
    let heat = 0;
    let unit = 0;
    // Milestones close together take the strongest pop rather than adding up.
    for (const sw of [d.D, d.U]) {
      for (const r of sw.rewards) {
        if (r.giga) continue;
        const tau = t - r.t;
        if (tau < 0 || tau > 1.2) continue;
        scale = Math.max(scale, (0.025 + 0.012 * r.level) * bump(tau, 0.09));
        heat = Math.max(heat, (0.2 + 0.08 * r.level) * bump(tau, 0.12));
      }
    }
    // Crossing from Mbps into Gbps is an event: the number pops and the unit flares.
    for (const tg of d.gigas) {
      const tau = t - tg;
      if (tau < 0 || tau > 1.6) continue;
      scale += 0.17 * bump(tau, 0.1);
      heat += 0.9 * bump(tau, 0.16);
      unit += 0.8 * bump(tau, 0.16);
    }
    return { scale: Math.min(scale, 0.2), heat: Math.min(heat, 0.92), unit: Math.min(unit, 1) };
  }

  /**
   * The number's glow at t, from 0 to 1. It fires on each catch, as its
   * reading shows, and on each milestone, as its shockwave leaves the eye
   * and the number pops; stepping up into Gbps pops it too. Each beat takes
   * over from the one before, which goes out as it swells in, so a ripple
   * of milestones 0.12 s apart dips to about half between its crests rather
   * than piling into a blaze, and a lone beat eases out in full. Words
   * rolling away take no beat from the moment they began to go (before),
   * so a beat lights only the reading it belongs to, even when it lands on
   * the very reading that rolls the number into Gbps.
   */
  private glowAt(t: number, before = Infinity): number {
    if (REDUCED) return 0;
    const d = this.data!;
    // The latest beat so far (at, k) and the one before it (at0, k0). A
    // milestone and the step into Gbps on the same reading are one beat.
    let at = -Infinity;
    let k = 0;
    let at0 = -Infinity;
    let k0 = 0;
    const beat = (tb: number, kb: number) => {
      if (tb > t || tb >= before) return;
      if (tb === at) k = Math.max(k, kb);
      else if (tb > at) [at0, k0, at, k] = [at, k, tb, kb];
      else if (tb === at0) k0 = Math.max(k0, kb);
      else if (tb > at0) [at0, k0] = [tb, kb];
    };
    for (let i = 0; i < d.throws.length; i++) beat(d.catchAt(i), 1);
    for (const sw of [d.D, d.U]) for (const r of sw.rewards) beat(r.t, lerp(0.8, 1, r.s));
    for (const tg of d.gigas) beat(tg, 1);
    return Math.max(k * glowOf(t - at), k0 * glowOf(t - at0) * (1 - smooth(0, GLOW_CUT, t - at)));
  }

  // A line of the eye that rolls when its words change: the old words lift
  // away over the first part, and the new ones rise into place over the
  // rest, fading across each other so the line is never empty. A catch hands
  // over on the catch itself: the old reading has lifted away as the
  // boomerang comes in, and the new one shows whole from the frame it lands.
  private rollLine(j: number, t: number, pick: (c: EyeWords) => string, style: (n: HTMLElement, c: EyeWords, t: number, before?: number) => void): void {
    const s = this.slots[j];
    const d = this.data!;
    let ev = null;
    for (const e of d.events) if ((j !== 0 || e.phase) && e.t <= t && t - e.t < e.dur) ev = e;
    const cur = this.eyeAt(t);
    const [a, b] = s.spans;
    if (ev && pick(this.eyeAt(ev.at - 1e-3)) !== pick(this.eyeAt(ev.at + 1e-4))) {
      const prev = this.eyeAt(ev.at - 1e-3);
      const next = t < ev.at ? this.eyeAt(ev.at + 1e-4) : cur;
      let oY: number;
      let oOp: number;
      let nY: number;
      let nOp: number;
      if (ev.land) {
        const so = span(t, ev.t, ev.at);
        const si = span(t, ev.at, ev.t + ev.dur);
        oY = -0.3 * EASE_OUT_SOFT(so);
        oOp = 1 - EASE_IN_OUT_SINE(so);
        nY = 0.12 * (1 - EASE_OUT_SOFT(si));
        nOp = t >= ev.at ? 1 : 0;
      } else {
        const so = span(t, ev.t, ev.t + 0.45 * ev.dur);
        const si = span(t, ev.t + 0.2 * ev.dur, ev.t + ev.dur);
        oY = -0.42 * EASE_OUT_SOFT(so);
        oOp = 1 - so;
        nY = 0.42 * (1 - EASE_OUT_SOFT(si));
        nOp = span(si, 0, 0.6);
      }
      put(a, 'text', pick(prev));
      put(b, 'text', pick(next));
      style(a, prev, t, ev.t);
      style(b, next, t);
      put(a, 'transform', `translateY(${(oY * MOVE).toFixed(3)}em)`);
      put(a, 'opacity', oOp.toFixed(3));
      put(b, 'transform', `translateY(${(nY * MOVE).toFixed(3)}em)`);
      put(b, 'opacity', nOp.toFixed(3));
    } else {
      put(a, 'text', pick(cur));
      style(a, cur, t);
      put(a, 'transform', 'none');
      put(a, 'opacity', '1');
      put(b, 'opacity', '0');
    }
  }

  private styleLabel = (n: HTMLElement, c: EyeWords, t: number) => {
    put(n, 'color', css(c.col));
    put(n, 'translate', `0 ${(-this.popAt(t).scale * 0.15 * this.S * MOVE).toFixed(2)}px`);
  };

  // The glow's copy of the digits and its colour change only with the
  // reading and the phase; only its strength moves frame to frame.
  private styleNum = (n: HTMLElement, c: EyeWords, t: number, before?: number) => {
    put(n, '@data-num', c.num);
    put(n, '--bloom-c', c.col.join(' '));
    if (c.dim) {
      put(n, 'color', css(INK, 0.4));
      put(n, 'scale', '1');
      put(n, '--bloom', '0');
      return;
    }
    const p = this.popAt(t);
    put(n, 'color', css(mixc(c.col, WHITE, c.dir < 0 ? 0 : p.heat)));
    put(n, 'scale', (1 + p.scale * MOVE).toFixed(4));
    put(n, '--bloom', this.glowAt(t, before).toFixed(3));
  };

  private styleUnit = (n: HTMLElement, _c: EyeWords, t: number) => {
    const p = this.popAt(t);
    put(n, 'color', p.unit > 0.01 ? css(mixc([150, 154, 147], LIME_ACC, p.unit)) : '');
    put(n, 'scale', (1 + 0.45 * p.unit * MOVE).toFixed(4));
    put(n, 'translate', `0 ${(p.scale * 0.15 * this.S * MOVE).toFixed(2)}px`);
  };

  /** The live number at run time t: its words, and its glide onto the result's upload line. */
  private eye(t: number): void {
    const d = this.data!;
    const R0 = d.P.r0;
    // The live number glides onto the result's upload line at the calm pace of the hand-offs between phases.
    const m = EASE_IN_OUT_SINE(span(t, R0, R0 + RES_MOVE));
    this.resultWords();
    ui.formed = t >= R0;
    ui.landed = m > 0.999;
    ui.settled = ui.screen === 'run' && !!d.result && t >= R0 + Math.max(RES_MOVE, 1.7);
    const measuring = ui.screen === 'run' && !d.result && t < d.failedAt && !ui.reopened;
    ui.phase = measuring ? (t < d.P.dl ? 'latency' : t < d.P.ul ? 'download' : 'upload') : '';
    ui.lit = t >= Math.min(R0, d.failedAt);
    // The result's own unit fades in beside the number as it lands.
    put(this.el.resUl[2], 'opacity', EASE_OUT(span(m, 0.45, 1)).toFixed(3));
    if (ui.landed || t < START_GONE - 0.1) return;
    this.rollLine(0, t, (c) => c.label, this.styleLabel);
    this.rollLine(1, t, (c) => c.num, this.styleNum);
    this.rollLine(2, t, (c) => c.unit, this.styleUnit);
    // Label and number glide onto the result's upload line; the unit fades
    // on the way and the result's own unit fades in beside the number.
    if (m > 0 && !this.flipChecked) this.checkFlip();
    this.slots.forEach((s, j) => {
      const [dx, dy, f] = this.flip[j];
      const sc = j === 2 ? 1 : lerp(1, f, m);
      put(s.el, 'transform', m > 0 ? `translate(${(dx * m * MOVE).toFixed(2)}px, ${(dy * m * MOVE).toFixed(2)}px) scale(${lerp(1, sc, MOVE).toFixed(4)})` : 'none');
    });
    put(this.slots[2].el, 'opacity', (1 - span(m, 0, 0.35)).toFixed(3));
  }

  // Start, lit and collapsing at the press: the press never moves it; it
  // shows in light alone, its face lightening under the finger and a comet of
  // the rim's own light running once round the disc from the touch. On
  // release the disc swells a little, then collapses on its own centre as the
  // shockwave leaves its rim, faster and faster, to nothing; it thins only
  // over its last few frames, so it never rests small. A resting cursor lifts
  // it, and the press and the run keep the lift.
  private start(now: number, t: number): void {
    const n = $('start');
    if (!n) return;
    const run = ui.screen === 'run' && !ui.reopened;
    let touch = 0;
    let sweep = 0;
    let sweepA = 0;
    const p = this.press;
    if (p.at >= 0 && ui.screen !== 'exit') {
      // A finger let go on Start but no click came: let the light go.
      if (ui.screen === 'idle' && p.up >= 0 && p.off < 0 && now - p.up > 0.3) p.off = now;
      const press = now - p.at;
      const off = ui.screen === 'idle' && p.off >= 0 ? now - p.off : null;
      if (off !== null && off > TOUCH_T && press > SWEEP_T) p.at = -1;
      else {
        touch = EASE_OUT(span(press, 0, TOUCH_T)) * (off === null ? 1 : 1 - EASE_OUT(span(off, 0, TOUCH_T)));
        if (!REDUCED) {
          const u = span(press, 0, SWEEP_T);
          sweep = p.ang + 360 * EASE_IN_OUT_SINE(u);
          sweepA = EASE_IN_OUT_SINE(u / 0.15) * (1 - EASE_IN_OUT_SINE(span(u, 0.55, 1)));
        }
      }
    }
    let scale = REDUCED ? 1 : 1 + HOVER_LIFT * this.hover.k;
    let op = '';
    if (run) {
      sweepA *= 1 - span(t, 0, START_SWELL_T);
      if (!REDUCED)
        scale *=
          t < START_SWELL_T
            ? lerp(1, START_SWELL, EASE_IN_OUT_SINE(span(t, 0, START_SWELL_T)))
            : START_SWELL * (1 - Math.pow(span(t, START_SWELL_T, START_GONE), 2.4));
      op = (t >= START_GONE ? 0 : 1 - span(t, START_GONE - START_THIN, START_GONE)).toFixed(3);
    }
    const glow = this.hover.glow(now, REDUCED);
    put(n, 'scale', scale.toFixed(5));
    put(n, 'opacity', op);
    put(n, '--hov', this.hover.k.toFixed(3));
    put(n, '--glow', glow.toFixed(3));
    put(n, '--touch', Math.max(touch, this.hover.k).toFixed(3));
    put(n, '--sweep', `${sweep.toFixed(1)}deg`);
    put(n, '--sweep-a', sweepA.toFixed(3));
  }

  /** The charts and the stats, from the readings so far. */
  private instruments(t: number): void {
    const d = this.data!;
    const P = d.P;
    // A failed run's charts stop where it failed, rather than stretching on.
    const tc = Math.min(t, d.failedAt);
    const progress = d.dirs.reduce((sum, dir) => sum + clamp((Math.min(tc, dir.t1) - dir.t0) / dir.length(tc), 0, 1), 0) / 2;
    ui.progress = Math.round(100 * progress);
    // Every figure not measured yet is a greyed zero in its reading's own type and width.
    const landed = d.throws.length >= THROWS ? d.catchAt(THROWS - 1) : d.result ? -Infinity : Infinity;
    const ready = t >= landed && d.idleMs !== undefined && d.jitterMs !== undefined;
    const stat = (i: number, f: Formatted, lit: boolean) => Object.assign(ui.stats[i], { value: f.value, unit: f.unit, lit });
    stat(0, formatMs(ready ? d.idleMs! : 0), ready);
    stat(1, formatMs(ready ? d.jitterMs! : 0), ready);
    stat(2, formatBytes(t >= P.dl ? d.bytes : 0), t >= P.dl);
    d.dirs.forEach((dir, i) => {
      ui.dirOn[i] = t >= dir.t0;
      this.charts[i].draw(dir, tc, DIR_RGB[i]);
    });
  }

  // ---------------------------------------------------------------------------
  // The frame

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    // The first frame the stage places; the measurement of first load reads it.
    this.root.ownerDocument.documentElement.dataset.drawn = '';
    const now = secs();
    this.layout();
    // Under the list the scene stays still while the page scrolls.
    if (!ui.list) this.follow(this.root.getBoundingClientRect().top);
    const clock = this.clock;
    const e = (now - clock.exitAt) * ui.pace;
    if (ui.screen === 'exit' && e >= EXIT_END) {
      clock.idleAt = clock.exitAt;
      this.history.homeFromRun();
      this.toIdle();
    }
    this.history.tick(now);
    const run = ui.screen !== 'idle';
    const t = run ? now - clock.runAt : 0;
    if (ui.screen === 'run' && this.live) this.live.tick(t);
    ui.canOpen = !ui.open && (ui.screen === 'idle' || (this.resultUp() && !ui.reopened));
    if (run && this.data) {
      this.eye(t);
      if (ui.screen === 'run' || e < 0.25) this.instruments(t);
    }
    this.hover.update(now, ui.screen, this.hand, $('start'), () => this.rims.startAngle());
    this.start(now, t);
    this.hand.ease(now);
    if (!REDUCED) {
      // Each key's box in the window, where the hand is.
      const box = (n: HTMLElement): KeyBox => {
        const r = n.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2, r.height / 2];
      };
      const dock = box(this.el.dock);
      const half = dock[2];
      const ci = this.cam.idle;
      const startBox: KeyBox = [ci.cx, ci.cy, this.S * 0.35 * ci.zoom, this.S * 0.35 * ci.zoom];
      const thumb: KeyBox = [dock[0] + ((ui.mode === 'fixed' ? 1 : 0) - 0.5) * half, dock[1], half / 2 - 4, dock[3] - 4];
      this.rims.update(now, this.hand, [startBox, box(this.el.gh), box(this.el.menu), dock, thumb, dock], this.hover);
    }
    this.drawScene(now, t, e);
  };

  private drawScene(now: number, t: number, e: number): void {
    const scene = this.scene;
    if (!scene) return;
    const run = ui.screen !== 'idle';
    const exit = ui.screen === 'exit';
    const reopened = ui.reopened && ui.screen === 'run';
    const rv = reopened ? this.history.rv(now) : 1;
    const d = this.data;
    if (d) scene.ulEnd = d.P.ulEnd;
    // The camera: 0 is the idle layout, 1 the run's.
    let k = run ? runCam(t) * rv : 0;
    if (exit) k *= 1 - EASE_IN_OUT(span(e, 0, 0.6));
    const { idle, run: rc } = this.cam;
    let idleClock = run ? (exit ? now - this.clock.exitAt : 0) : now - this.clock.idleAt;
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
      lean: REDUCED ? 0 : handK * this.hover.k,
      startX: idle.cx,
      startY: idle.cy,
      zoom: lerp(idle.zoom, 1, k),
      cx: lerp(idle.cx, rc.cx, k),
      cy: lerp(idle.cy, rc.cy, k),
      hand: this.hand,
    });
  }
}

const unitOf = (r: Reading | undefined) => (r?.g ? 'Gbps' : 'Mbps');

/** n's centre from root's, in layout pixels, to a fraction of a pixel. */
function centreIn(n: HTMLElement, root: HTMLElement): [number, number] {
  const a = n.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return [a.left + a.width / 2 - b.left - b.width / 2, a.top + a.height / 2 - b.top - b.height / 2];
}

/** n's baseline on screen: the top of a mark of no size sitting on it. Browsers round a font's ascent and descent per size, so a line's box does not scale with its words, but its baseline does. */
function baselineAt(n: HTMLElement): number {
  const mk = document.createElement('i');
  mk.style.cssText = 'display: inline-block; width: 0; height: 0';
  n.appendChild(mk);
  const y = mk.getBoundingClientRect().top;
  mk.remove();
  return y;
}

function baselineIn(n: HTMLElement, root: HTMLElement): number {
  const b = root.getBoundingClientRect();
  return baselineAt(n) - b.top - b.height / 2;
}

/** Runs fn with every transform on these elements lifted, so it measures layout alone. */
function untransformed<T>(els: HTMLElement[], fn: () => T): T {
  const kept = els.map((n) => [n.style.transform, n.style.scale, n.style.translate, n.style.transition]);
  els.forEach((n) => {
    n.style.transition = 'none';
    n.style.transform = 'none';
    n.style.scale = 'none';
    n.style.translate = 'none';
  });
  const out = fn();
  els.forEach((n, i) => {
    [n.style.transform, n.style.scale, n.style.translate, n.style.transition] = kept[i];
  });
  return out;
}

/** The page's one stage, for the components' presses. */
export const app: { stage?: Stage; quiet?: boolean } = {};
