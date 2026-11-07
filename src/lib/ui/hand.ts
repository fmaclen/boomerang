// The hand: the cursor on a desktop, the phone's tilt on a phone. It lights
// the keys' rims and, in idle, gently moves the boomerangs. Every reading is
// eased along a critically damped curve, so nothing follows it twitchily.

import { EASE_IN_OUT, EASE_IN_OUT_SINE, TAU, clamp, damp, lerp, span } from '../scene/math';
import type { Hand as SceneHand } from '../scene';

export class Hand implements SceneHand {
  /** -1 to 1 each way with y up, eased. */
  x = 0;
  y = 0;
  private tx = 0;
  private ty = 0;
  private vx = 0;
  private vy = 0;
  /** The cursor on screen: eased for the rims (mx, my) and more closely for the repel (rx, ry). */
  mx = 0;
  my = 0;
  rx = 0;
  ry = 0;
  private tmx = 0;
  private tmy = 0;
  private v = { mx: 0, my: 0, rx: 0, ry: 0, on: 0, mo: 0 };
  /** How present the hand is, any kind, and the cursor alone. */
  on = 0;
  mouseOn = 0;
  mouse = false;
  tilt = false;
  private g0: number | null = null;
  private b0 = 0;
  private last = 0;
  dt = 0;

  constructor(reduced: boolean) {
    if (reduced) return;
    window.addEventListener('pointermove', (ev) => {
      if (ev.pointerType !== 'mouse' && ev.pointerType !== 'pen') return;
      if (!this.mouse && this.mouseOn < 0.02) {
        this.mx = this.rx = ev.clientX;
        this.my = this.ry = ev.clientY;
        this.v.mx = this.v.my = this.v.rx = this.v.ry = 0;
      }
      this.mouse = true;
      this.aimAt(ev.clientX, ev.clientY);
    });
    // A cursor that leaves the window lets go, so everything eases back home.
    document.addEventListener('mouseout', (ev) => {
      if (!ev.relatedTarget) this.mouse = false;
    });
    // iOS only shares tilt once asked from a tap, and asking opens a system
    // prompt. So the first tap anywhere but Start asks: on Start the prompt
    // would come up over its exit. Denied or unavailable, idle simply drifts.
    const ask = (ev: Event) => {
      if ((ev.target as Element | null)?.closest?.('#start')) return;
      document.removeEventListener('click', ask, true);
      this.askTilt();
    };
    document.addEventListener('click', ask, true);
  }

  private aimAt(cx: number, cy: number): void {
    this.tmx = cx;
    this.tmy = cy;
    this.tx = clamp((cx / innerWidth) * 2 - 1, -1, 1);
    this.ty = clamp(1 - (cy / innerHeight) * 2, -1, 1);
  }

  private askTilt(): void {
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (!DOE || !window.matchMedia('(pointer: coarse)').matches) return;
    const listen = () => window.addEventListener('deviceorientation', (ev) => this.onTilt(ev));
    if (typeof DOE.requestPermission === 'function') {
      DOE.requestPermission()
        .then((s) => {
          if (s === 'granted') listen();
        })
        .catch(() => {});
    } else listen();
  }

  // Tilt, measured from how the phone is being held: the rest pose follows
  // the reading slowly, so holding it at any angle comes back to centre.
  private onTilt(ev: DeviceOrientationEvent): void {
    if (ev.beta === null || ev.gamma === null) return;
    if (this.g0 === null) {
      this.g0 = ev.gamma;
      this.b0 = ev.beta;
    }
    this.g0 += (ev.gamma - this.g0) * 0.004;
    this.b0 += (ev.beta - this.b0) * 0.004;
    this.tx = clamp((ev.gamma - this.g0) / 20, -1, 1);
    this.ty = clamp((this.b0 - ev.beta) / 20, -1, 1);
    this.tilt = true;
  }

  ease(now: number): void {
    const dt = clamp(now - (this.last || now), 0, 0.1);
    this.last = now;
    this.dt = dt;
    const v = this.v;
    [this.x, this.vx] = damp(this.x, this.vx, this.tx, 0.3, dt);
    [this.y, this.vy] = damp(this.y, this.vy, this.ty, 0.3, dt);
    [this.mx, v.mx] = damp(this.mx, v.mx, this.tmx, 0.3, dt);
    [this.my, v.my] = damp(this.my, v.my, this.tmy, 0.3, dt);
    [this.rx, v.rx] = damp(this.rx, v.rx, this.tmx, 0.08, dt);
    [this.ry, v.ry] = damp(this.ry, v.ry, this.tmy, 0.08, dt);
    [this.on, v.on] = damp(this.on, v.on, this.mouse || this.tilt ? 1 : 0, 0.5, dt);
    [this.mouseOn, v.mo] = damp(this.mouseOn, v.mo, this.mouse ? 1 : 0, 0.5, dt);
  }
}

/** A key whose rim catches the light: its centre and half its width and height, in CSS pixels. */
export type KeyBox = [number, number, number, number];

const RIM_EASE = 0.2; // seconds each rim takes to follow its light
const RIM_FALL = 160; // px beyond a key's edge at which the cursor's light is half as strong
/** While the cursor rests on Start its rim light drifts once round it every HOVER_TURN seconds. */
const HOVER_TURN = 7;
const tri = (x: number) => {
  x = x - 2 * Math.floor(x / 2);
  return x < 1 ? x : 2 - x;
};

/**
 * The rim light on each key, drawn the way light catches the edge of glass.
 * The cursor is a small light held a little above the screen: each key's rim
 * is brightest on the edge facing it, more so the lower it shines across the
 * key, and when it is right over a key the whole rim lights evenly instead.
 * The light falls off with distance, giving way to a slow drift along the
 * top of the rim, which is all there is with no hand. On a phone the tilt
 * swings one light, from the upper left, round every key the same way.
 */
export class Rims {
  private ids: string[];
  private state: { x: number; y: number; e: number; vx: number; vy: number; ve: number; on: boolean }[];
  private memo: { el: HTMLElement | null; hand: string; hi: string; even: string }[];

  /** The keys, by id; one that comes and goes with its page (Start) takes its light up again when it is back. */
  constructor(ids: string[]) {
    this.ids = ids;
    this.state = ids.map(() => ({ x: 0, y: 0, e: 0, vx: 0, vy: 0, ve: 0, on: false }));
    this.memo = ids.map(() => ({ el: null, hand: '', hi: '', even: '' }));
  }

  /** The angle Start's rim light sits at now, where a hover's drift picks up from. */
  startAngle(): number {
    return Math.atan2(this.state[0].x, -this.state[0].y);
  }

  /** at holds each key's box, in the order given; hover drifts the first key's light round it from angle rim0, since `since`. */
  update(now: number, hand: Hand, at: KeyBox[], hover: { k: number; since: number; rim0: number }): void {
    const drift = ((-75 + 90 * EASE_IN_OUT(tri(now / 7))) * Math.PI) / 180;
    this.ids.forEach((id, i) => {
      // Vectors point from the key's centre toward the lit edge, y down; a
      // vector's length is how strongly that edge is lit.
      let tx = Math.sin(drift);
      let ty = -Math.cos(drift);
      let te = 0;
      if (hand.on > 0.001) {
        let lx: number;
        let ly: number;
        let lit: number;
        let slant: number;
        if (hand.mouse) {
          // The edge facing the cursor: from the nearest point of the key's
          // core (its centre line, for a capsule), out to the rim.
          const [kx, ky, hw, hh] = at[i];
          const core = Math.max(0, hw - hh);
          const qx = clamp(hand.mx, kx - core, kx + core);
          const nx = hand.mx - qx;
          const ny = hand.my - ky;
          const nd = Math.hypot(nx, ny);
          const rx = qx - kx + (nd > 1e-3 ? (hh * nx) / nd : 0);
          const ry = nd > 1e-3 ? (hh * ny) / nd : -hh;
          const rl = Math.hypot(rx, ry) || 1;
          lx = rx / rl;
          ly = ry / rl;
          slant = nd / Math.hypot(nd, 0.6 * hh);
          const out = Math.max(0, nd - hh) / RIM_FALL;
          lit = 1 / (1 + out * out);
        } else {
          const vx = -0.45 + 1.2 * hand.x;
          const vy = -0.6 - 1.2 * hand.y;
          const m = Math.hypot(vx, vy);
          lx = m > 1e-3 ? vx / m : 0;
          ly = m > 1e-3 ? vy / m : -1;
          slant = m / Math.hypot(m, 0.35);
          lit = 1;
        }
        const k = hand.on * lit;
        tx = tx * (1 - k) + lx * k * 1.1 * slant;
        ty = ty * (1 - k) + ly * k * 1.1 * slant;
        te = 0.5 * k * (1 - slant);
      }
      if (i === 0 && hover.k > 0.001) {
        const a = hover.rim0 + ((now - hover.since) * TAU) / HOVER_TURN;
        tx = lerp(tx, 1.05 * Math.sin(a), hover.k);
        ty = lerp(ty, -1.05 * Math.cos(a), hover.k);
        te = lerp(te, 0.12, hover.k);
      }
      const s = this.state[i];
      if (!s.on) {
        s.on = true;
        s.x = tx;
        s.y = ty;
        s.e = te;
      }
      [s.x, s.vx] = damp(s.x, s.vx, tx, RIM_EASE, hand.dt);
      [s.y, s.vy] = damp(s.y, s.vy, ty, RIM_EASE, hand.dt);
      [s.e, s.ve] = damp(s.e, s.ve, te, RIM_EASE, hand.dt);
      const ang = `${((Math.atan2(s.x, -s.y) * 180) / Math.PI).toFixed(1)}deg`;
      const hi = Math.min(Math.hypot(s.x, s.y), 1.15).toFixed(3);
      const ev = Math.max(0, s.e).toFixed(3);
      const m = this.memo[i];
      const n = document.getElementById(id);
      if (!n) return;
      if (m.el !== n) Object.assign(m, { el: n, hand: '', hi: '', even: '' });
      if (m.hand !== ang) n.style.setProperty('--hand', (m.hand = ang));
      if (m.hi !== hi) n.style.setProperty('--hi', (m.hi = hi));
      if (m.even !== ev) n.style.setProperty('--even', (m.even = ev));
    });
  }
}

// Start comes alive under a resting cursor, never a finger: over HOVER_IN it
// lifts by HOVER_LIFT on a deeper shadow, its lime brightens and a halo of it
// spreads into the scene, breathing once every BREATH_T seconds; its rim
// light drifts round it and the nearest boomerangs lean in. It settles over
// HOVER_OUT when the cursor leaves. A press keeps all of it, so nothing
// moves under the cursor, and the run holds it while the disc collapses.
// Script keeps it, since the scene leans with it.
const HOVER_IN = 0.26;
const HOVER_OUT = 0.34;
export const HOVER_LIFT = 0.04;
const BREATH_T = 2.8;

export class Hover {
  k = 0;
  since = 0;
  rim0 = 0;
  private from = 0;
  private to = 0;
  private at = -1;
  private fine = window.matchMedia('(hover: hover) and (pointer: fine)');

  /** screen is the app's; startAngle where Start's rim light is now. */
  update(now: number, screen: string, hand: Hand, start: HTMLElement | null, startAngle: () => number): void {
    if (screen === 'exit') {
      this.from = this.to = this.k = 0;
      this.at = -1;
    } else if (screen === 'idle') {
      const want = start && this.fine.matches && hand.mouse && !(start as HTMLButtonElement).disabled && start.matches(':hover') ? 1 : 0;
      if (want !== this.to) {
        this.from = this.k;
        this.to = want;
        this.at = now;
        if (want && this.k < 0.05) {
          this.since = now;
          this.rim0 = startAngle();
        }
      }
      if (this.at >= 0) this.k = lerp(this.from, this.to, EASE_IN_OUT_SINE(span(now - this.at, 0, this.to ? HOVER_IN : HOVER_OUT)));
    }
  }

  /** The halo's breathing glow. */
  glow(now: number, reduced: boolean): number {
    return this.k * (reduced ? 1 : 0.78 + 0.22 * (0.5 - 0.5 * Math.cos((TAU * (now - this.since)) / BREATH_T)));
  }
}
