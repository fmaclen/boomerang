// A live run: starts the engine and fills a RunData from its progress, on
// the run's clock. The engine measures as fast as it can; the page holds
// each transfer back until the screen is ready for it (the ping throws
// before download, a beat after download), so the scene never shows a
// phase the measurement is not in.

import { saveRun, startRun, type Mode, type Progress, type Run } from '../engine';
import { RunData } from './data';
import { FLY, LAND_DL, LAND_PING, LAND_UL, PING_AT, THROWS, TRIP } from './timing';
import type { Swarm } from '../scene/swarm';

export class LiveRun {
  readonly data: RunData;
  private run: Run;
  private clock: () => number;
  /** When the last throw leaves: as scheduled, or once the idle latency is in if that is later. */
  private lastLeave = Infinity;
  private stopped = false;

  /**
   * clock gives the run's time in seconds since Start. The result shows the
   * moment it is measured, and is saved beside it: a slow or absent store
   * never holds it up. onSaved hears its id once it is kept.
   */
  constructor(mode: Mode, swarms: { D: Swarm; U: Swarm }, clock: () => number, onSaved: (id: string) => void) {
    this.clock = clock;
    this.data = new RunData(mode, swarms);
    this.run = startRun(mode, (p) => this.stopped || this.progress(p), (phase) => this.beat(phase));
    this.run.done.then(
      (r) => {
        const d = this.data;
        d.result = r;
        d.bytes = r.download.bytes + r.upload.bytes;
        d.P.r0 = Math.max(d.P.ulEnd + LAND_UL, this.clock());
        void saveRun(r).then((kept) => kept && !this.stopped && onSaved(r.id));
      },
      (error: unknown) => {
        if (this.stopped) return;
        // The reason a run failed (a refused upload, an unreachable box) is in the console.
        console.warn('Boomerang: the run failed:', error);
        this.data.fail(this.clock(), error instanceof Error ? error.message : String(error));
      },
    );
  }

  /** Stop: nothing more is shown, and nothing is saved. */
  abort(): void {
    this.stopped = true;
    this.run.abort();
  }

  /** Throws each ping boomerang when its time comes. Called every frame. */
  tick(t: number): void {
    const d = this.data;
    while (d.throws.length < THROWS) {
      const i = d.throws.length;
      const leave = i < THROWS - 1 ? PING_AT + i * TRIP : this.lastLeave;
      if (t < leave) break;
      d.throwAt(leave);
    }
  }

  // Download waits for the last throw to come home and a beat after it;
  // upload waits a beat after download. The transfer's own clock starts
  // when the wait ends, so the measurement is unchanged.
  private beat(phase: 'download' | 'upload'): Promise<void> {
    const t = this.clock();
    let until: number;
    if (phase === 'download') {
      this.lastLeave = Math.max(PING_AT + (THROWS - 1) * TRIP, t);
      until = this.lastLeave + FLY + LAND_PING;
    } else until = t + LAND_DL;
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, (until - t) * 1000)));
  }

  private progress(p: Progress): void {
    const t = this.clock();
    const d = this.data;
    if (p.pings) d.pings = p.pings;
    if (p.idleMs !== undefined && d.idleMs === undefined) {
      d.idleMs = p.idleMs;
      d.jitterMs = p.jitterMs;
    }
    if (p.phase === 'download' || p.phase === 'upload') {
      const i = p.phase === 'download' ? 0 : 1;
      const dir = d.dirs[i];
      if (dir.t0 === Infinity) d.phaseStart(i, t);
      // The report that ends a phase carries its result and a rate of zero;
      // the line and the swarm hold the last real reading instead.
      if (dir.final === undefined && !(i ? p.upload : p.download)) {
        d.read(i, t, p.mbps);
        d.bytes = p.bytes;
      }
    }
    if (p.download && d.dirs[0].final === undefined) d.phaseEnd(0, t, p.download.mbps);
    if (p.upload && d.dirs[1].final === undefined) {
      d.bytes = p.download!.bytes + p.upload.bytes;
      d.phaseEnd(1, t, p.upload.mbps);
    }
  }
}
