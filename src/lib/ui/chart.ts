// A chart is its direction's progress. The baseline is the whole phase,
// framed by a tick at each end and lit as far as the run has gone; the rate
// draws above it, left to right, from the meter's readings. The baseline
// spans the shortest the phase can run, so it fills at one steady pace; a
// phase that runs longer holds its head at the end while the line stretches
// (see Direction.length).

import type { Direction } from '../run/data';
import { TAU } from '../scene/math';

const INK = [241, 247, 235];
const css = (c: number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export class Chart {
  private ctx: CanvasRenderingContext2D;
  private key = '';
  private w = 0;
  private h = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  reset(): void {
    this.key = '';
  }

  draw(dir: Direction, t: number, rgb: number[]): void {
    const c = this.canvas;
    const at = t <= dir.t0 ? -1 : Math.min(t, dir.t1);
    const length = dir.length(at);
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    const key = `${at.toFixed(3)}/${length.toFixed(4)}/${dir.readings.length}`;
    if (key === this.key && this.w === cw && this.h === ch) return;
    this.key = key;
    const k = Math.min(window.devicePixelRatio || 1, 2);
    if (this.w !== cw || this.h !== ch) {
      c.width = Math.round(cw * k);
      c.height = Math.round(ch * k);
      this.w = cw;
      this.h = ch;
    }
    const g = this.ctx;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const tick = ch > 80 ? 8 : 6;
    g.fillStyle = css(INK, 0.16);
    g.fillRect(0, ch - 2, cw, 2);
    g.fillRect(0, ch - tick, 2, tick);
    g.fillRect(cw - 2, ch - tick, 2, tick);
    if (at < 0) return;
    const pts: [number, number][] = [];
    let top = 1;
    for (const r of dir.readings) {
      if (r.t > at) break;
      pts.push([r.t - dir.t0, r.mbps]);
      top = Math.max(top, r.mbps);
    }
    if (!pts.length) pts.push([0, 0]);
    const vEnd = pts[pts.length - 1][1];
    pts.push([at - dir.t0, vEnd]);
    // Headroom, so the line never rides the top edge; a phone's short chart
    // keeps its line's top 4px under its own, close to the label over it.
    top = top / (ch > 80 ? 0.78 : (ch - 6.75) / (ch - 4));
    const X = (u: number) => Math.min(1, u / length) * cw;
    const Y = (v: number) => ch - 2 - (v / top) * (ch - 4);
    const color = css(rgb);
    g.beginPath();
    g.moveTo(X(pts[0][0]), ch - 2);
    for (const [u, v] of pts) g.lineTo(X(u), Y(v));
    g.lineTo(X(at - dir.t0), ch - 2);
    g.closePath();
    g.fillStyle = css(rgb, 0.14);
    g.fill();
    g.beginPath();
    pts.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v))));
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = ch > 80 ? 2 : 1.5;
    g.strokeStyle = color;
    g.stroke();
    g.fillStyle = color;
    g.fillRect(0, ch - 2, X(at - dir.t0), 2);
    g.fillRect(0, ch - tick, 2, tick);
    if (at >= dir.t1) g.fillRect(cw - 2, ch - tick, 2, tick);
    else {
      g.beginPath();
      g.arc(X(at - dir.t0), Y(vEnd), ch > 80 ? 3 : 2.5, 0, TAU);
      g.fill();
    }
  }
}
