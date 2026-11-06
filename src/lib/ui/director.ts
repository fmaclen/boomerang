// The director runs the page frame by frame. Like the scene, every frame of
// the interface is a function of the run's clock (seconds since Start) and,
// on the way home, of the seconds since New test, so motion never depends on
// how often frames come. The markup lives in the components; this moves it,
// writes the live figures into it, and wires every press.

import { formatBytes, formatMs, formatRate, listResults, prepareRun, type Formatted } from '../engine';
import { RunData, type Reading } from '../run/data';
import { LiveRun } from '../run/live';
import {
  EXIT_END,
  RES_MOVE,
  SETTLE,
  START_GONE,
  START_SWELL,
  START_SWELL_T,
  START_THIN,
  THROWS,
} from '../run/timing';
import { Scene, runCam, type Cam } from '../scene';
import {
  EASE_DRAWER,
  EASE_IN_OUT,
  EASE_IN_OUT_SINE,
  EASE_OUT,
  EASE_OUT_SOFT,
  bump,
  clamp,
  lerp,
  mixc,
  smooth,
  span,
  type RGB,
} from '../scene/math';
import { pingPath, PING_ANGLE, PING_MAX, PING_MIN, pingReach } from '../scene/ping';
import { env, makeSwarms, type Swarm } from '../scene/swarm';
import { Chart } from './chart';
import { UNIT } from './classes';
import { $, $$, css, setAttr, setHTML, setStyle, setText, show } from './dom';
import { Hand, HOVER_LIFT, Hover, Rims, type KeyBox } from './hand';
import { HistoryNav, type HistNow } from './history';
import { ui } from './state.svelte';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Reduced motion keeps the fades and drops the movement. */
const MOVE = REDUCED ? 0 : 1;
const WIDE = '(min-width: 900px) and (min-height: 560px)';
/** How much of the scene's light is held back behind the interface. */
const DIM = 0.86;
const TOUCH_T = 0.16;
const SWEEP_T = 0.9;
const RGB_LIME = [161, 255, 89];
const RGB_LIME_ACC = [198, 255, 134];
const RGB_ORANGE = [255, 122, 48];
const RGB_INK = [241, 247, 235];
const RGB_WHITE = [255, 255, 255];
const DIR_RGB = [RGB_LIME, RGB_ORANGE];
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

export type Screen = 'idle' | 'run' | 'exit';

interface Slot {
  el: HTMLElement;
  spans: HTMLElement[];
}

/** What the eye shows at a moment: the phase, its colour, the number and its unit. */
interface EyeWords {
  label: string;
  col: number[];
  num: string;
  dim: boolean;
  unit: string;
  dir: number;
}

interface FrameState {
  run: boolean;
  t: number;
  exit: boolean;
  e: number;
  idleClock: number;
  firstIdle: boolean;
  h: HistNow;
  press: number | null;
  pressOff: number | null;
  hover: number;
  glow: number;
}

const secs = () => performance.now() / 1000;

export class Director {
  readonly scene: Scene | null;
  readonly seed = (Math.random() * 0x7fffffff) | 0;
  readonly el;
  private slots: Slot[];
  private charts: Chart[];
  private hand = new Hand(REDUCED);
  private rims: Rims;
  private hover = new Hover();
  readonly history: HistoryNav;
  readonly clock = { screen: 'idle' as Screen, idleAt: secs(), runAt: 0, exitAt: 0, exitPace: 1, runTW: 0, firstIdle: true };
  private press = { at: -1, ang: -40, up: -1, off: -1 };
  private live: LiveRun | null = null;
  /** The next run's swarms, made while idle (see ready). */
  private nextSwarms: { D: Swarm; U: Swarm } | null = null;
  /** The run on screen: live, or a saved one History reopened. */
  data: RunData | null = null;
  private resultShown = '';
  private W = 0;
  private H = 0;
  private dpr = 1;
  private S = 200;
  private wide = false;
  readonly cam: { run: Cam; idle: Cam } = { run: { zoom: 1, cx: 0, cy: 0 }, idle: { zoom: 1, cx: 0, cy: 0 } };
  /** Per live line: [dx, dy, scale] that lands it on the result's upload line. */
  private flip: number[][] = [[0, 0, 1], [0, 0, 1], [0, 0, 1]];
  private flipChecked = false;
  /** How far a reopened run's charts come down to sit over its details. */
  whereDy = 0;
  private masks: { b: number[]; run: boolean }[] = [];
  private keyAt: { gh: KeyBox; menu: KeyBox; dock: KeyBox; dockW: number } = {
    gh: [0, 0, 0, 0],
    menu: [0, 0, 0, 0],
    dock: [0, 0, 0, 0],
    dockW: 0,
  };
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = Scene.create(canvas, this.seed);
    env.reduced = REDUCED;
    this.el = {
      eye: $('eye'),
      startWrap: $('startWrap'),
      start: $<HTMLButtonElement>('start'),
      live: $('live'),
      result: $('result'),
      stage: $('stage'),
      chartsBox: $('charts'),
      dock: $('dock'),
      thumb: $('thumb'),
      dkey: $('dkey'),
      lit: $('lit'),
      gh: $('gh'),
      action: $<HTMLButtonElement>('action'),
      menu: $<HTMLAnchorElement>('menu'),
      logo: $<HTMLAnchorElement>('logo'),
      top: $$('.top')[0],
      track: $$('.track')[0],
      charts: $$('.chart'),
      chartCaps: $$('.chart figcaption'),
      stats: $$('.stats dd'),
      statsRow: $$('.stats')[0],
      modes: $$<HTMLButtonElement>('.modes button'),
      modesRow: $$('.modes')[0],
      actStop: $$('.act-stop')[0],
      actNew: $$('.act-new')[0],
      where: $('where'),
      resRows: $$('.res'),
      resLines: $$('.res-line'),
      resUl: ['.res-label', '.res-num', '.res-unit'].map((q) => $$(`.res-ul ${q}`)[0]),
    };
    this.slots = ['lvPhase', 'lvNum', 'lvUnit'].map((id) => {
      const s = $(id);
      return { el: s, spans: [...s.children] as HTMLElement[] };
    });
    this.charts = $$<HTMLCanvasElement>('.chart canvas').map((c) => new Chart(c));
    const el = this.el;
    this.rims = new Rims([el.start, el.gh, el.menu, el.track, el.thumb, el.dkey]);
    this.history = new HistoryNav(this);
    this.wire();
    void document.fonts.ready.then(() => {
      this.layout(true);
      this.raf = requestAnimationFrame(this.frame);
      this.ready();
    });
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
  }

  get reduced(): boolean {
    return REDUCED;
  }

  // ---------------------------------------------------------------------------
  // Presses

  private wire(): void {
    const el = this.el;
    // A press on Start: when it went down, where round the disc it touched
    // (degrees clockwise from the top), when a finger let go on it (the click
    // follows) and when a press that slid off was let go.
    el.start.addEventListener('pointerdown', (ev) => {
      if (this.clock.screen !== 'idle') return;
      const r = el.start.getBoundingClientRect();
      this.press.at = secs();
      this.press.ang = (Math.atan2(ev.clientX - (r.left + r.width / 2), r.top + r.height / 2 - ev.clientY) * 180) / Math.PI;
      this.press.up = -1;
      this.press.off = -1;
    });
    const letGo = (ev: PointerEvent) => {
      const p = this.press;
      if (p.at < 0 || p.off >= 0 || this.clock.screen !== 'idle') return;
      const r = el.start.getBoundingClientRect();
      const inside = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2)) <= r.width / 2;
      if (ev.type === 'pointerup' && inside) p.up = secs();
      else p.off = secs();
    };
    window.addEventListener('pointerup', letGo);
    window.addEventListener('pointercancel', letGo);
    el.start.addEventListener('click', () => this.pressStart());
    el.action.addEventListener('click', () => this.pressAction());
    // The logo goes home: it stops a run the way Stop and New test do, and closes History.
    // A click with a modifier is the browser's (a new tab, a new window), as on any link.
    el.logo.addEventListener('click', (ev) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      if (this.history.open) this.history.home();
      else this.pressAction();
    });
    el.modes.forEach((b, i) => {
      b.addEventListener('click', () => this.selectMode(i));
      b.addEventListener('keydown', (ev) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) {
          ev.preventDefault();
          this.selectMode(1 - i);
          el.modes[1 - i].focus();
        }
      });
    });
    // A press sweeps the light once round the rim of the key that moves.
    const kick = (n: HTMLElement) => {
      if (REDUCED) return;
      n.classList.remove('kick');
      void n.offsetWidth;
      n.classList.add('kick');
    };
    document.addEventListener('animationend', (ev) => {
      if (ev.animationName === 'rim-sweep') (ev.target as HTMLElement).classList.remove('kick');
    });
    const kicks: [HTMLElement, HTMLElement][] = [
      [el.gh, el.gh],
      [el.menu, el.menu],
      [el.action, el.dkey],
      ...el.modes.map((b): [HTMLElement, HTMLElement] => [b, el.thumb]),
    ];
    for (const [n, rim] of kicks) n.addEventListener('pointerdown', () => kick(rim));
    this.history.wire(kick);
    window.addEventListener('resize', () => this.layout());
  }

  private selectMode(i: number): void {
    ui.mode = i ? 'fixed' : 'adaptive';
  }

  private get modeIndex(): number {
    return ui.mode === 'fixed' ? 1 : 0;
  }

  pressStart(): void {
    if (this.clock.screen !== 'idle' || this.history.open) return;
    const now = secs();
    // A start with no press on the disc (a key) lights from now.
    if (this.press.at < 0 || this.press.off >= 0) {
      this.press.at = now;
      this.press.ang = -40;
    }
    this.press.off = -1;
    this.clock.runTW = now - this.clock.idleAt;
    this.clock.runAt = now;
    this.clock.screen = 'run';
    const swarms = this.nextSwarms ?? makeSwarms(this.seed);
    this.nextSwarms = null;
    this.live = new LiveRun(ui.mode, swarms, () => secs() - this.clock.runAt);
    this.useRun(this.live.data);
  }

  /** Puts a run on screen: its swarms in the scene and its words in the result. */
  useRun(data: RunData): void {
    this.data = data;
    this.scene?.useSwarms(data.D, data.U, data.P.ulEnd);
    if (this.scene) this.scene.throws = data.throws;
    for (const c of this.charts) c.reset();
    this.resultShown = '';
    this.resultWords();
  }

  /** Stop during a run, New test after it: the way home. pace runs it faster when History takes the scene home under it. */
  pressAction(pace = 1): void {
    if (this.clock.screen !== 'run') return;
    if (this.live && !this.data?.result) this.live.abort();
    this.clock.exitAt = secs();
    this.clock.exitPace = pace;
    this.clock.screen = 'exit';
    this.press.at = -1;
  }

  /** Whether the result is up (or the run failed), so History may open over it. */
  resultUp(now = secs()): boolean {
    const d = this.data;
    if (!d || this.clock.screen !== 'run') return false;
    const t = now - this.clock.runAt;
    return t >= Math.min(d.P.r0, d.failedAt);
  }

  // ---------------------------------------------------------------------------
  // Layout: the stage element is where the swarm goes during a run; in idle
  // the swarm also takes the band the instruments will fill.

  layout(force = false): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!force && W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    const el = this.el;
    const wide = (this.wide = window.matchMedia(WIDE).matches);
    const st = el.stage.getBoundingClientRect();
    const dk = el.dock.getBoundingClientRect();
    const room = wide ? st.width : W - 28;
    const S = (this.S = Math.max(60, Math.min(room, st.height) / REACH));
    this.cam.run = { zoom: 1, cx: W / 2, cy: st.top + st.height / 2 };
    // Idle has only Start inside the swarm, so the swarm grows into the empty
    // band between the top bar and the mode choice, centred in it.
    const top = st.top;
    const bottom = dk.top - 12;
    const zi = clamp(Math.min(wide ? W : W * 1.1, bottom - top) / REACH / S, 1, 1.22);
    this.cam.idle = { zoom: zi, cx: W / 2, cy: (top + bottom) / 2 };
    this.keyAt = { gh: centreOf(el.gh), menu: centreOf(el.menu), dock: centreOf(el.dock), dockW: el.dock.clientWidth };
    document.documentElement.style.setProperty('--s', `${S.toFixed(2)}px`);
    this.measureFlips();
    // Boxes the scene dims behind: always, or only during a run.
    const box = (els: HTMLElement[], pad: number) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const n of els) {
        const r = untransformed([n], () => n.getBoundingClientRect());
        x0 = Math.min(x0, r.left);
        y0 = Math.min(y0, r.top);
        x1 = Math.max(x1, r.right);
        y1 = Math.max(y1, r.bottom);
      }
      return [(x0 - pad) * dpr, (H - y1 - pad) * dpr, (x1 + pad) * dpr, (H - y0 + pad) * dpr];
    };
    this.masks = [{ b: box([el.top], 10), run: false }, { b: box([el.dock], 12), run: false }];
    if (wide) {
      this.masks.push({ b: box([el.charts[0]], 16), run: true }, { b: box([el.charts[1]], 16), run: true }, { b: box([el.statsRow], 12), run: true });
    } else this.masks.push({ b: box([el.charts[0], el.charts[1], el.statsRow], 12), run: true });
    for (const c of this.charts) c.reset();
    // How far each ping throw may loop out: up to PING_MAX, as long as every
    // point of the loop stays on screen and clear of the interface.
    const keepOut = this.masks.map(({ b }) => [b[0] / dpr, H - b[3] / dpr, b[2] / dpr, H - b[1] / dpr]);
    const pad = S * 0.12 + 6;
    const roomy = (x: number, y: number) =>
      x > pad && x < W - pad && y > pad && y < H - pad && keepOut.every(([a, b, c, d]) => x < a - pad || x > c + pad || y < b - pad || y > d + pad);
    PING_ANGLE.forEach((_, j) => {
      let lo = PING_MIN;
      let hi = PING_MAX;
      for (let it = 0; it < 16; it++) {
        pingReach[j] = (lo + hi) / 2;
        let ok = true;
        for (let q = 0; q <= 60 && ok; q++) {
          const [r, th] = pingPath(j, q / 60);
          ok = roomy(this.cam.run.cx + S * r * Math.cos(th), this.cam.run.cy - S * r * Math.sin(th));
        }
        if (ok) lo = pingReach[j];
        else hi = pingReach[j];
      }
      pingReach[j] = lo;
    });
    this.history.layout(wide, this.cam.idle.cy);
    this.placeWhere();
    this.scene?.layout(W, H, dpr, S, this.cam);
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
    const ul = el.resRows[1];
    const targets = [ul.querySelector('.res-label')!, ul.querySelector('.res-num')!, ul.querySelector('.res-num')!] as HTMLElement[];
    const moved = [el.eye, el.live, el.result, ...this.slots.flatMap((s) => [s.el, s.spans[0]]), ...targets];
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
  private checkFlip(zoom: number): void {
    this.flipChecked = true;
    [this.el.resUl[0], this.el.resUl[1]].forEach((target, j) => {
      const s = this.slots[j];
      const n = s.spans[0];
      const keep = s.el.style.transform;
      const [dx, dy, f] = this.flip[j];
      s.el.style.transform = `translate(${dx}px, ${dy}px) scale(${f})`;
      const a = n.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      this.flip[j][0] += (b.left + b.width / 2 - a.left - a.width / 2) / zoom;
      this.flip[j][1] += (baselineAt(target) - baselineAt(n)) / zoom;
      s.el.style.transform = keep;
    });
    this.flip[2] = [this.flip[1][0], this.flip[1][1], 1];
  }

  /**
   * A reopened run's details take the stats row's and the bottom key's band.
   * On a wide screen they start where the stats row does, across the top
   * bar's width. On a phone, across the charts' width, they end where the key
   * does, and the charts come down with them to stay the stats row's
   * distance above (whereDy).
   */
  placeWhere(): void {
    const el = this.el;
    const sr = untransformed([el.statsRow], () => el.statsRow.getBoundingClientRect());
    const box = this.wide ? el.top.getBoundingClientRect() : el.chartsBox.getBoundingClientRect();
    setStyle(el.where, 'left', `${box.left}px`);
    setStyle(el.where, 'width', `${box.width}px`);
    const top = this.wide ? sr.top : el.dock.getBoundingClientRect().bottom - el.where.offsetHeight;
    setStyle(el.where, 'top', `${top}px`);
    this.whereDy = top - sr.top;
  }

  /** The result's words, known once the run has finished, so the move onto them can be measured. Until then there is nothing to measure. */
  private resultWords(): void {
    const result = this.data?.result;
    if (!result) return;
    const words = [formatRate(result.download.mbps), formatRate(result.upload.mbps)];
    this.el.resRows.forEach((row, i) => {
      setText(row.querySelector('.res-num')!, words[i].value);
      setText(row.querySelector('.res-unit')!, words[i].unit);
    });
    this.measureFlips();
  }

  // ---------------------------------------------------------------------------
  // The eye

  /** What the eye shows at run time t. */
  private eyeAt(t: number): EyeWords {
    const d = this.data!;
    if (t >= d.failedAt) {
      const last = this.eyeAt(d.failedAt - 1e-3);
      return { ...last, label: 'Failed', col: RGB_INK, dim: true, dir: -1 };
    }
    if (t < d.dirs[0].t0) {
      let n = -1;
      for (let i = 0; i < d.throws.length; i++) if (t >= d.catchAt(i)) n = i;
      // Until the first catch the number waits at a greyed zero, the width of a reading.
      if (n < 0) return { label: 'Ping', col: RGB_INK, num: formatMs(0).value, dim: true, unit: 'ms', dir: -1 };
      const f = formatMs(d.catchValue(n));
      return { label: 'Ping', col: RGB_INK, num: f.value, dim: false, unit: f.unit, dir: -1 };
    }
    // Each direction takes over the eye as its phase starts, with its swarm;
    // until the meter's first reading its number waits at a greyed zero.
    const i = t < d.dirs[1].t0 ? 0 : 1;
    const dir = d.dirs[i];
    let f: Formatted;
    if (t < dir.firstAt && t < dir.t1) {
      f = formatRate(0);
      return { label: i ? 'Upload' : 'Download', col: DIR_RGB[i], num: f.value, dim: true, unit: f.unit, dir: i };
    }
    if (t < dir.t1 || dir.final === undefined) {
      const r = dir.readingAt(t);
      f = formatRate(r?.mbps ?? 0, unitOf(r));
    } else {
      const last = dir.readings[dir.readings.length - 1];
      const settle = EASE_OUT(span(t, dir.t1, dir.t1 + SETTLE));
      f = settle >= 1 ? formatRate(dir.final) : formatRate(lerp(last?.mbps ?? dir.final, dir.final, settle), formatRate(dir.final).unit);
    }
    return { label: i ? 'Upload' : 'Download', col: DIR_RGB[i], num: f.value, dim: false, unit: f.unit, dir: i };
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
  private rollLine(
    j: number,
    t: number,
    pick: (c: EyeWords) => string,
    style: (n: HTMLElement, c: EyeWords, t: number, before?: number) => void,
  ): void {
    const s = this.slots[j];
    const d = this.data!;
    let ev = null;
    for (const e of d.events) if ((j !== 0 || e.phase) && e.t <= t && t - e.t < e.dur) ev = e;
    const cur = this.eyeAt(t);
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
      setText(s.spans[0], pick(prev));
      setText(s.spans[1], pick(next));
      style(s.spans[0], prev, t, ev.t);
      style(s.spans[1], next, t);
      setStyle(s.spans[0], 'transform', `translateY(${(oY * MOVE).toFixed(3)}em)`);
      setStyle(s.spans[0], 'opacity', oOp.toFixed(3));
      setStyle(s.spans[1], 'transform', `translateY(${(nY * MOVE).toFixed(3)}em)`);
      setStyle(s.spans[1], 'opacity', nOp.toFixed(3));
    } else {
      setText(s.spans[0], pick(cur));
      style(s.spans[0], cur, t);
      setStyle(s.spans[0], 'transform', 'none');
      setStyle(s.spans[0], 'opacity', '1');
      setStyle(s.spans[1], 'opacity', '0');
    }
  }

  private styleLabel = (n: HTMLElement, c: EyeWords, t: number) => {
    setStyle(n, 'color', css(c.col));
    setStyle(n, 'translate', `0 ${(-this.popAt(t).scale * 0.15 * this.S * MOVE).toFixed(2)}px`);
  };

  // The glow's copy of the digits and its colour change only with the
  // reading and the phase; only its strength moves frame to frame.
  private styleNum = (n: HTMLElement, c: EyeWords, t: number, before?: number) => {
    setAttr(n, 'data-num', c.num);
    setStyle(n, '--bloom-c', c.col.join(' '));
    if (c.dim) {
      setStyle(n, 'color', css(RGB_INK, 0.4));
      setStyle(n, 'scale', '1');
      setStyle(n, '--bloom', '0');
      return;
    }
    const p = this.popAt(t);
    setStyle(n, 'color', css(mixc(c.col as RGB, RGB_WHITE as RGB, c.dir < 0 ? 0 : p.heat)));
    setStyle(n, 'scale', (1 + p.scale * MOVE).toFixed(4));
    setStyle(n, '--bloom', this.glowAt(t, before).toFixed(3));
  };

  private styleUnit = (n: HTMLElement, _c: EyeWords, t: number) => {
    const p = this.popAt(t);
    setStyle(n, 'color', p.unit > 0.01 ? css(mixc([150, 154, 147], RGB_LIME_ACC as RGB, p.unit)) : '');
    setStyle(n, 'scale', (1 + 0.45 * p.unit * MOVE).toFixed(4));
    setStyle(n, 'translate', `0 ${(p.scale * 0.15 * this.S * MOVE).toFixed(2)}px`);
  };

  // ---------------------------------------------------------------------------
  // One frame of the interface. Returns what the scene needs.

  private updateUI(st: FrameState) {
    const el = this.el;
    const { run, exit, h } = st;
    const t = run ? st.t : -1;
    const e = exit ? st.e : 0;
    const d = this.data;
    const P = d?.P;
    const cam = this.cam;
    const S = this.S;
    const R0 = P ? P.r0 : Infinity;
    // The key lights into New test when the result forms, or when the run fails.
    const litAt = d ? Math.min(R0, d.failedAt) : Infinity;

    // Camera: 0 is the idle layout, 1 the run layout.
    let k = run ? runCam(t) * h.rv : 0;
    if (exit) k *= 1 - EASE_IN_OUT(span(e, 0, 0.6));
    const view = { zoom: lerp(cam.idle.zoom, 1, k), cx: lerp(cam.idle.cx, cam.run.cx, k), cy: lerp(cam.idle.cy, cam.run.cy, k) };
    // The eye's words sit at the run's camera from the press, so nothing in
    // them travels or lands and then moves on: the ping layout appears in
    // its own place at its final size and only fades up, while Start, held
    // where it was pressed, collapses on its own centre.
    let ke = run ? 1 : 0;
    // On the way home Start grows back out of the number as it travels, on one curve.
    const back = exit ? EASE_OUT(span(e, 0.12, 0.45)) : 0;
    ke *= 1 - back;
    const eye = { zoom: lerp(cam.idle.zoom, 1, ke), cx: lerp(cam.idle.cx, cam.run.cx, ke), cy: lerp(cam.idle.cy, cam.run.cy, ke) };
    setStyle(el.eye, 'transform', `translate(${eye.cx.toFixed(2)}px, ${eye.cy.toFixed(2)}px) scale(${eye.zoom.toFixed(4)})`);
    // Until the way home, Start stays at idle's place and size whatever the eye's camera does.
    const startAt = run && !exit ? cam.idle : eye;

    // Start collapses where it was pressed, and grows back out of the result.
    // On release the disc swells a little, then collapses on its own centre
    // as the shockwave leaves its rim, faster and faster, to nothing; it
    // thins only over its last few frames, so it never rests small.
    let sOp = 1;
    let sScale = 1;
    if (run) {
      sScale =
        t < START_SWELL_T
          ? lerp(1, START_SWELL, EASE_IN_OUT_SINE(span(t, 0, START_SWELL_T)))
          : START_SWELL * (1 - Math.pow(span(t, START_SWELL_T, START_GONE), 2.4));
      sOp = t >= START_GONE ? 0 : 1 - span(t, START_GONE - START_THIN, START_GONE);
    }
    if (exit) {
      sScale = 0.45 + 0.55 * back;
      sOp = span(e, 0.12, 0.17);
    }
    // A resting cursor lifts it; the press and the run keep the lift.
    const hk = st.hover;
    if (!REDUCED) sScale *= 1 + HOVER_LIFT * hk;
    // Under History, Start sinks back and fades.
    sOp *= 1 - h.disc;
    sScale *= 1 - 0.06 * h.disc;
    // The press never moves Start; it shows in light alone. Its face
    // lightens under the finger and a comet of the rim's own light runs once
    // round the disc from the touch.
    let touch = 0;
    let sweep = 0;
    let sweepA = 0;
    if (!exit && st.press !== null) {
      touch = EASE_OUT(span(st.press, 0, TOUCH_T));
      if (st.pressOff !== null) touch *= 1 - EASE_OUT(span(st.pressOff, 0, TOUCH_T));
      if (!REDUCED) {
        const u = span(st.press, 0, SWEEP_T);
        sweep = this.press.ang + 360 * EASE_IN_OUT_SINE(u);
        sweepA = EASE_IN_OUT_SINE(u / 0.15) * (1 - EASE_IN_OUT_SINE(span(u, 0.55, 1)));
      }
    }
    if (run && !exit) sweepA *= 1 - span(t, 0, START_SWELL_T);
    // The fade is on the disc itself, not its wrapper, so its frosted blur
    // keeps seeing the scene behind it all the way out.
    setStyle(el.startWrap, 'visibility', sOp > 0.002 ? 'visible' : 'hidden');
    setStyle(el.start, 'opacity', sOp.toFixed(3));
    setStyle(el.start, 'background-color', `rgba(${(161 + 16 * st.glow).toFixed(1)}, 255, ${(89 + 22 * st.glow).toFixed(1)}, ${(0.94 + 0.06 * Math.max(touch, hk)).toFixed(4)})`);
    setStyle(el.start, '--hov', hk.toFixed(3));
    setStyle(el.start, '--glow', st.glow.toFixed(3));
    setStyle(el.start, '--sweep', `${sweep.toFixed(1)}deg`);
    setStyle(el.start, '--sweep-a', sweepA.toFixed(3));
    const pinX = (startAt.cx - eye.cx) / eye.zoom;
    const pinY = (startAt.cy - eye.cy) / eye.zoom;
    const pinZ = startAt.zoom / eye.zoom;
    setStyle(el.startWrap, 'transform', `translate(${pinX.toFixed(2)}px, ${pinY.toFixed(2)}px) translate(-50%, -50%) scale(${(lerp(1, sScale, MOVE) * pinZ).toFixed(5)})`);
    el.start.disabled = run || h.open;

    // The live number. It glides onto the result's upload line at the calm
    // pace of the hand-offs between phases.
    const m = run ? EASE_IN_OUT_SINE(span(t, R0, R0 + RES_MOVE)) : 0;
    // It comes up as the disc goes, already at its full size and in its own
    // place, a frame and a half before the disc is gone.
    const IN = START_GONE - 0.025;
    let lOp = run ? EASE_OUT(span(t, IN, IN + 0.3)) : 0;
    let lScale = 1;
    if (exit) {
      const x = EASE_OUT(span(e, 0, 0.2));
      lOp *= 1 - x;
      lScale *= 1 - 0.04 * x;
    }
    // The live line lands exactly on the result's upload line and hands over to it in one frame.
    if (m > 0.999) lOp = 0;
    show(el.live, lOp);
    setStyle(el.live, 'transform', `translate(-50%, -50%) scale(${lerp(1, lScale, MOVE).toFixed(4)})`);
    if (lOp > 0.002 && d) {
      this.rollLine(0, t, (c) => c.label, this.styleLabel);
      this.rollLine(1, t, (c) => c.num, this.styleNum);
      this.rollLine(2, t, (c) => c.unit, this.styleUnit);
      // Label and number glide onto the result's upload line; the unit fades
      // on the way and the result's own unit fades in beside the number.
      if (m > 0 && !this.flipChecked) this.checkFlip(eye.zoom);
      this.slots.forEach((s, j) => {
        const [dx, dy, f] = this.flip[j];
        const sc = j === 2 ? 1 : lerp(1, f, m);
        setStyle(s.el, 'transform', m > 0 ? `translate(${(dx * m * MOVE).toFixed(2)}px, ${(dy * m * MOVE).toFixed(2)}px) scale(${lerp(1, sc, MOVE).toFixed(4)})` : 'none');
      });
      setStyle(this.slots[2].el, 'opacity', (1 - span(m, 0, 0.35)).toFixed(3));
    }
    // The run's test ids: running while it measures, with its phase.
    const measuring = run && !exit && !!d && !d.result && t < d.failedAt && !h.reopened;
    setAttr(el.live, 'data-testid', measuring ? 'running' : null);
    setAttr(el.live, 'data-phase', measuring ? (t < P!.dl ? 'latency' : t < P!.ul ? 'download' : 'upload') : null);

    // The result: upload is the live number come to rest; download joins it from above.
    let rOp = run && t >= R0 ? 1 : 0;
    let rScale = 1;
    if (exit) {
      const x = EASE_OUT(span(e, 0, 0.2));
      rOp *= 1 - x;
      rScale = 1 - 0.04 * x;
    }
    // A reopened run's numbers come up once the list has gone.
    if (h.res < 1) {
      rOp *= h.res;
      rScale *= 0.96 + 0.04 * h.res;
    }
    setStyle(el.result, 'opacity', rOp.toFixed(3));
    setStyle(el.result, 'transform', `translate(-50%, -50%) scale(${lerp(1, rScale, MOVE).toFixed(4)})`);
    const a = EASE_OUT_SOFT(span(t, R0 + 0.5, R0 + 1.7));
    setStyle(el.resRows[0], 'opacity', a.toFixed(3));
    setStyle(el.resRows[0], 'transform', `translateY(${(-(1 - a) * 0.05 * S * MOVE).toFixed(2)}px)`);
    setStyle(el.resUl[0], 'opacity', m > 0.999 ? '1' : '0');
    setStyle(el.resUl[1], 'opacity', m > 0.999 ? '1' : '0');
    setStyle(el.resUl[2], 'opacity', EASE_OUT(span(m, 0.45, 1)).toFixed(3));
    // The result is present once the run has finished, and settled once the
    // number has landed and download has risen in beside it.
    const done = run && !exit && !!d?.result;
    if (done && this.resultShown !== d!.result!.id) {
      this.resultShown = d!.result!.id;
      this.resultWords();
      ui.runs = listResults();
    }
    setAttr(el.result, 'data-testid', done ? 'result' : null);
    setAttr(el.result, 'data-settled', done && t >= R0 + Math.max(RES_MOVE, 1.7) ? '' : null);
    el.resLines.forEach((n) => setAttr(n, 'aria-hidden', rOp > 0.5 ? null : 'true'));

    // Instruments under (or beside) the swarm.
    const groups = [el.charts[0], el.charts[1], el.statsRow];
    const stagger = [0, 0.08, 0.16];
    groups.forEach((g, i) => {
      let x = run ? EASE_OUT(span(t, START_GONE + stagger[i], START_GONE + 0.8 + stagger[i])) * h.inst[i] : 0;
      let y = (1 - x) * 10;
      if (exit) {
        const o = EASE_OUT(span(e, 0, 0.22));
        x *= 1 - o;
        y += o * 6;
      }
      show(g, x);
      // A reopened run's charts sit over its details (see placeWhere).
      const dy = h.reopened && i < 2 ? this.whereDy : 0;
      setStyle(g, 'transform', `translateY(${(y * MOVE + dy).toFixed(2)}px)`);
    });
    if (run && d && (!exit || e < 0.25)) this.instruments(t);

    // The bottom key, in one slot: in idle the mode track with its thumb; at
    // Start the thumb opens out into the whole key, which says Stop and then,
    // lit a little brighter, New test. The way back closes it onto the thumb.
    // The key is sized, not clipped, so its rim and shadow follow its edge,
    // and its label never leaves it. While History is up the key steps aside
    // whole, keeping the look it had.
    const keep = 1 - h.dock;
    const dExit = exit && !h.open;
    const w = el.dock.clientWidth;
    const half = w / 2;
    const pad = 4;
    const mode = this.modeIndex;
    let full = run ? EASE_IN_OUT(span(t, 0.05, 0.95)) : 0;
    if (dExit) full *= 1 - EASE_OUT(span(e, 0.05, 0.37));
    const keyOn = run && full > 0.001;
    const L = lerp(pad + mode * (half - pad), 0, full);
    const R = lerp(pad + (1 - mode) * (half - pad), 0, full);
    const T = lerp(pad, 0, full);
    setStyle(el.dkey, 'inset', `${T.toFixed(2)}px ${R.toFixed(2)}px ${T.toFixed(2)}px ${L.toFixed(2)}px`);
    // At Start the key comes up under the thumb, at the thumb's size, and the
    // thumb fades off the top of it before the key starts to open.
    show(el.dkey, keep * (dExit ? (keyOn ? 1 : 0) : run ? EASE_OUT(span(t, 0, 0.08)) : 0));
    show(el.thumb, keep * (dExit ? (keyOn ? 0 : 1) : run ? 1 - EASE_IN_OUT_SINE(span(t, 0.02, 0.22)) : 1));
    show(el.track, keep * (1 - full));
    let lit = run ? EASE_OUT_SOFT(span(t, litAt + 0.3, litAt + 1.1)) : 0;
    if (dExit) lit *= 1 - EASE_OUT(span(e, 0, 0.16));
    setStyle(el.lit, 'opacity', lit.toFixed(3));
    // Stop is a secondary key, hollow: the glass gives way to an even
    // hairline as the label rolls into Stop, and comes back as the key
    // lights into New test, or closes back onto the thumb on the way home.
    let hollow = run ? EASE_IN_OUT_SINE(span(t, 0.3, 0.7)) * (1 - span(lit, 0, 0.6)) : 0;
    if (dExit) hollow *= 1 - EASE_OUT(span(e, 0, 0.3));
    setStyle(el.dkey, '--hollow', hollow.toFixed(3));
    show(el.actNew, span(lit, 0.1, 0.4) * keep);
    const toStop = run ? span(t, 0.3, 0.7) : 0;
    const ROLL_KEY = 10;
    const keyMid = (L + w - R) / 2;
    el.modes.forEach((b, i) => {
      const n = b.firstElementChild as HTMLElement;
      const chosen = i === mode;
      let op = run && !dExit ? (chosen ? 1 - toStop : 1 - full) : 1;
      if (dExit) op = span(e, 0.22, 0.42);
      const moving = chosen && run && !dExit;
      const dx = moving ? keyMid - (i + 0.5) * half : 0;
      const dy = moving ? -ROLL_KEY * toStop * MOVE : 0;
      setStyle(n, 'opacity', (op * keep).toFixed(3));
      setStyle(n, 'translate', dx || dy ? `${dx.toFixed(2)}px ${dy.toFixed(2)}px` : 'none');
    });
    // Stop clears just before the face lights; New test comes up with it.
    let stopOp = toStop * (1 - span(t, litAt, litAt + 0.3));
    if (dExit) stopOp *= 1 - span(e, 0, 0.08);
    setStyle(el.actStop, 'opacity', (stopOp * keep).toFixed(3));
    // Stop rides the key's centre until the key has opened all the way.
    setStyle(
      el.actStop,
      'translate',
      run && !dExit && (toStop < 1 || full < 1) ? `${(keyMid - half).toFixed(2)}px ${(ROLL_KEY * (1 - toStop) * MOVE).toFixed(2)}px` : 'none',
    );
    const screen = h.open ? 'hist' : !run || (exit && e > 0.42) ? 'idle' : 'run';
    if (el.dock.dataset.screen !== screen) {
      el.dock.dataset.screen = screen;
      (el.modesRow as HTMLElement & { inert: boolean }).inert = screen !== 'idle';
      el.action.inert = screen !== 'run';
    }
    el.action.disabled = exit;
    const isNew = t >= litAt;
    setAttr(el.action, 'aria-label', isNew ? 'New test' : 'Stop');
    setAttr(el.action, 'data-testid', isNew ? 'new-run' : 'stop');

    // The scene dims behind the instruments as they arrive, and a pool of
    // shade sits behind the number, wider for the two-line result.
    const boxes = new Float32Array(24);
    const boxK = new Float32Array(6);
    this.masks.forEach((mk, i) => {
      boxes.set(mk.b, i * 4);
      boxK[i] = DIM * (mk.run ? k : 1);
    });
    // Behind History the whole scene dims, as one box past every edge.
    boxes.set([-1e5, -1e5, 1e5, 1e5], this.masks.length * 4);
    boxK[this.masks.length] = this.history.dimK * h.dim;
    return { ...view, eye, start: startAt, boxes, boxK, eyeR: lerp(0.42, 0.5, m) * S * eye.zoom, eyeK: Math.max(lOp, rOp) };
  }

  // Every figure not measured yet starts as greyed zeros in its reading's own
  // type and width, and brightens into its first reading over STAT_LIT.
  private stat(n: HTMLElement, f: { value: string; unit: string }, t: number, t0: number): void {
    const k = t < t0 ? 0 : EASE_OUT(span(t, t0, t0 + 0.4));
    const lit = k > 0.999 ? '' : ` style="color: ${css(RGB_INK, +(0.42 + 0.58 * k).toFixed(3))}"`;
    setHTML(n, `<b${lit}>${f.value}</b><span class="${UNIT}">${f.unit}</span>`);
  }

  private instruments(t: number): void {
    const el = this.el;
    const d = this.data!;
    const P = d.P;
    const dirs = d.dirs;
    // A failed run's charts stop where it failed, rather than stretching on.
    const tc = Math.min(t, d.failedAt);
    const progress = dirs.reduce((sum, dir) => sum + clamp((Math.min(tc, dir.t1) - dir.t0) / dir.length(tc), 0, 1), 0) / 2;
    setAttr(el.chartsBox, 'aria-valuenow', String(Math.round(100 * progress)));
    const landed = d.throws.length >= THROWS ? d.catchAt(THROWS - 1) : d.result ? -Infinity : Infinity;
    const ready = t >= landed && d.idleMs !== undefined && d.jitterMs !== undefined;
    this.stat(el.stats[0], formatMs(ready ? d.idleMs! : 0), t, landed);
    this.stat(el.stats[1], formatMs(ready ? d.jitterMs! : 0), t, landed);
    this.stat(el.stats[2], formatBytes(t >= P.dl ? d.bytes : 0), t, P.dl);
    dirs.forEach((dir, i) => {
      setStyle(el.chartCaps[i], 'color', css(mixc([106, 111, 106], DIR_RGB[i] as RGB, EASE_OUT(span(t, dir.t0, dir.t0 + 1.2)))));
      this.charts[i].draw(dir, tc, DIR_RGB[i]);
      // A fixed run's result keeps its rate over time.
      setAttr(el.charts[i], 'data-testid', d.result?.mode === 'fixed' ? (i ? 'samples-upload' : 'samples-download') : null);
    });
  }

  // ---------------------------------------------------------------------------
  // The frame

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    // The interface shows from this frame, the first the director places (see the layout).
    document.documentElement.dataset.drawn = '';
    const now = secs();
    this.layout();
    const clock = this.clock;
    const exitE = (now - clock.exitAt) * clock.exitPace;
    if (clock.screen === 'exit' && exitE >= EXIT_END) {
      clock.screen = 'idle';
      clock.idleAt = clock.exitAt;
      clock.firstIdle = false;
      this.live = null;
      this.history.homeFromRun();
      this.ready();
    }
    this.history.tick(now);
    if (clock.screen === 'run' && this.live) this.live.tick(now - clock.runAt);
    let st: Omit<FrameState, 'h' | 'press' | 'pressOff' | 'hover' | 'glow'>;
    if (clock.screen === 'idle') st = { run: false, t: 0, exit: false, e: 0, idleClock: now - clock.idleAt, firstIdle: clock.firstIdle };
    else if (clock.screen === 'run') st = { run: true, t: now - clock.runAt, exit: false, e: 0, idleClock: 0, firstIdle: false };
    else st = { run: true, t: now - clock.runAt, exit: true, e: exitE, idleClock: now - clock.exitAt, firstIdle: false };
    // How long ago Start was pressed, and a slid-off press let go.
    let press: number | null = null;
    let pressOff: number | null = null;
    const p = this.press;
    if (p.at >= 0 && clock.screen !== 'exit') {
      // A finger let go on Start but no click came: let the light go.
      if (clock.screen === 'idle' && p.up >= 0 && p.off < 0 && now - p.up > 0.3) p.off = now;
      press = now - p.at;
      if (clock.screen === 'idle' && p.off >= 0) {
        pressOff = now - p.off;
        if (pressOff > TOUCH_T && press > SWEEP_T) {
          p.at = -1;
          press = null;
          pressOff = null;
        }
      }
    }
    const h = this.history.now(now);
    const hv = this.hover.update(now, clock.screen, this.hand, this.el.start, () => this.rims.startAngle(), REDUCED);
    const full: FrameState = { ...st, h, press, pressOff, ...hv };
    const view = this.updateUI(full);
    this.history.draw(now, h);
    this.hand.ease(now);
    if (!REDUCED) {
      const ka = this.keyAt;
      const half = ka.dockW / 2;
      const startBox: KeyBox = [view.start.cx, view.start.cy, this.S * 0.35 * view.start.zoom, this.S * 0.35 * view.start.zoom];
      const thumb: KeyBox = [ka.dock[0] + (this.modeIndex - 0.5) * half, ka.dock[1], half / 2 - 4, ka.dock[3] - 4];
      this.rims.update(now, this.hand, [startBox, ka.gh, ka.menu, ka.dock, thumb, ka.dock], this.hover);
    }
    this.drawScene(full, view, h, now);
    document.body.dataset.ready = '1';
  };

  private drawScene(st: FrameState, view: ReturnType<Director['updateUI']>, h: HistNow, now: number): void {
    const scene = this.scene;
    if (!scene) return;
    const d = this.data;
    if (d) scene.ulEnd = d.P.ulEnd;
    let idleGf = 0;
    if (!st.run) idleGf = st.firstIdle ? EASE_OUT(span(st.idleClock, 0, 0.6)) : 1;
    else if (st.exit) idleGf = EASE_OUT(span(st.e, 0.15, 0.6));
    let idleClock = st.idleClock;
    // A reopened run crossfades with idle, which carries on underneath it.
    if (h.reopened) {
      idleClock = now - this.clock.idleAt;
      idleGf = 1 - h.rv;
    }
    const runTW = this.clock.runTW;
    // The drifting field: idle's own, or the one Start is clearing.
    let drift: { clock: number; gf: number; clear: number } | null = null;
    if (idleGf > 0.001) drift = { clock: idleClock, gf: idleGf, clear: -1 };
    else if (st.run && st.t < 1.15 && !h.reopened) drift = { clock: runTW + st.t, gf: 1, clear: st.t };
    // The boomerangs answer the hand only in idle: it lets go as a run starts and comes back on the way home.
    let handK = st.run ? 1 - EASE_DRAWER(span(st.t, 0, 1.0)) : 1;
    if (st.exit) handK = Math.max(handK, EASE_OUT(span(st.e, 0.15, 0.75)));
    if (h.reopened) handK = 1 - h.rv;
    const frame = {
      run: st.run,
      t: st.t,
      runTW: h.reopened ? 0 : runTW,
      runGf: (st.exit ? 1 - EASE_DRAWER(span(st.e, 0, 0.45)) : 1) * h.rv,
      idleGf,
      idleTW: idleClock,
      drift,
      handK: REDUCED ? 0 : handK * this.hand.on,
      lean: REDUCED ? 0 : handK * st.hover,
      startX: view.start.cx,
      startY: view.start.cy,
      zoom: view.zoom,
      cx: view.cx,
      cy: view.cy,
      boxes: view.boxes,
      boxK: view.boxK,
      eyeX: view.eye.cx,
      eyeY: view.eye.cy,
      eyeR: view.eyeR,
      eyeK: view.eyeK,
      hand: this.hand,
    };
    scene.frame(frame);
  }

  /** History reopens a saved run: it is shown as a result at rest, on its own clock. */
  showReplay(data: RunData): void {
    this.useRun(data);
    this.clock.runAt = secs() - data.restAt;
    this.clock.runTW = 0;
    this.clock.screen = 'run';
    this.press.at = -1;
  }

  /** A reopened run has eased back under the list: idle carries on behind it. */
  endReplay(): void {
    this.clock.screen = 'idle';
    this.clock.firstIdle = false;
    this.data = null;
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
  const kept = els.map((n) => [n.style.transform, n.style.scale, n.style.translate]);
  els.forEach((n) => {
    n.style.transform = 'none';
    n.style.scale = 'none';
    n.style.translate = 'none';
  });
  const out = fn();
  els.forEach((n, i) => {
    [n.style.transform, n.style.scale, n.style.translate] = kept[i];
  });
  return out;
}

function centreOf(n: HTMLElement): KeyBox {
  const r = n.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2, r.height / 2];
}

