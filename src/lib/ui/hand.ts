// The hand: a resting cursor, eased along a critically damped curve so
// nothing follows it twitchily. In idle it gently moves the boomerangs (see
// the scene), and a cursor resting on Start lifts it and draws the nearest
// pieces in. Touch has no hand.

import { EASE_IN_OUT_SINE, TAU, clamp, damp, lerp, span } from '../scene/math';
import type { Hand as SceneHand } from '../scene';

export class Hand implements SceneHand {
  /** -1 to 1 each way with y up, eased. */
  x = 0;
  y = 0;
  private tx = 0;
  private ty = 0;
  private vx = 0;
  private vy = 0;
  /** The cursor on screen, eased for the repel. */
  rx = 0;
  ry = 0;
  private tmx = 0;
  private tmy = 0;
  private v = { rx: 0, ry: 0, on: 0, mo: 0 };
  /** How present the cursor is. */
  on = 0;
  mouseOn = 0;
  mouse = false;
  readonly tilt = false;
  private last = 0;
  dt = 0;
  private off: () => void = () => {};

  constructor(reduced: boolean) {
    if (reduced) return;
    const move = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse' && ev.pointerType !== 'pen') return;
      if (!this.mouse && this.mouseOn < 0.02) {
        this.rx = ev.clientX;
        this.ry = ev.clientY;
        this.v.rx = this.v.ry = 0;
      }
      this.mouse = true;
      this.tmx = ev.clientX;
      this.tmy = ev.clientY;
      this.tx = clamp((ev.clientX / innerWidth) * 2 - 1, -1, 1);
      this.ty = clamp(1 - (ev.clientY / innerHeight) * 2, -1, 1);
    };
    // A cursor that leaves the window lets go, so everything eases back home.
    const out = (ev: MouseEvent) => {
      if (!ev.relatedTarget) this.mouse = false;
    };
    addEventListener('pointermove', move);
    document.addEventListener('mouseout', out);
    this.off = () => {
      removeEventListener('pointermove', move);
      document.removeEventListener('mouseout', out);
    };
  }

  destroy(): void {
    this.off();
  }

  ease(now: number): void {
    const dt = clamp(now - (this.last || now), 0, 0.1);
    this.last = now;
    this.dt = dt;
    const v = this.v;
    [this.x, this.vx] = damp(this.x, this.vx, this.tx, 0.3, dt);
    [this.y, this.vy] = damp(this.y, this.vy, this.ty, 0.3, dt);
    [this.rx, v.rx] = damp(this.rx, v.rx, this.tmx, 0.08, dt);
    [this.ry, v.ry] = damp(this.ry, v.ry, this.tmy, 0.08, dt);
    [this.on, v.on] = damp(this.on, v.on, this.mouse ? 1 : 0, 0.5, dt);
    [this.mouseOn, v.mo] = damp(this.mouseOn, v.mo, this.mouse ? 1 : 0, 0.5, dt);
  }
}

// Start comes alive under a resting cursor, never a finger: over HOVER_IN it
// lifts by HOVER_LIFT on a deeper shadow, its lime brightens and a halo of it
// spreads into the scene, breathing once every BREATH_T seconds, and the
// nearest boomerangs lean in. It settles over HOVER_OUT when the cursor
// leaves. A press keeps all of it, so nothing moves under the cursor, and the
// run holds it while the disc collapses. Script keeps it, since the scene
// leans with it.
const HOVER_IN = 0.26;
const HOVER_OUT = 0.34;
export const HOVER_LIFT = 0.04;
const BREATH_T = 2.8;

export class Hover {
  k = 0;
  private since = 0;
  private from = 0;
  private to = 0;
  private at = -1;
  private fine = matchMedia('(hover: hover) and (pointer: fine)');

  /** screen is the app's; over, whether a resting cursor is on Start. */
  update(now: number, screen: string, over: boolean): void {
    if (screen === 'exit') {
      this.from = this.to = this.k = 0;
      this.at = -1;
    } else if (screen === 'idle') {
      const want = this.fine.matches && over ? 1 : 0;
      if (want !== this.to) {
        this.from = this.k;
        this.to = want;
        this.at = now;
        if (want && this.k < 0.05) this.since = now;
      }
      if (this.at >= 0) this.k = lerp(this.from, this.to, EASE_IN_OUT_SINE(span(now - this.at, 0, this.to ? HOVER_IN : HOVER_OUT)));
    }
  }

  /** The halo's breathing glow. */
  glow(now: number, reduced: boolean): number {
    return this.k * (reduced ? 1 : 0.78 + 0.22 * (0.5 - 0.5 * Math.cos((TAU * (now - this.since)) / BREATH_T)));
  }
}
