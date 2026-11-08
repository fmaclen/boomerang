// A run as the page shows it: its timeline on the run's clock (seconds since
// Start), the readings the number and the charts show, and the swarms. A live
// run is filled in from the engine's progress as it arrives (see live.ts); a
// saved run is rebuilt in one go from its result, to reopen it at rest.

import { MIN_PHASE_SECONDS, formatRate, type Mode, type Result } from '../engine';
import { DT, type Swarm } from '../scene/swarm';
import { median } from '../scene/math';
import {
  CATCH_LEAD,
  CATCH_SETTLE,
  FLY,
  LAND_DL,
  LAND_UL,
  RES_MOVE,
  ROLL,
  ROLL_PHASE,
  THROWS,
} from './timing';

/** One reading of the meter: the rate at run time t, and whether it reads in Gbps (held until the rate falls under 950 Mbps). */
export interface Reading {
  t: number;
  mbps: number;
  g: boolean;
}

/** A moment the eye's words change: from t, for dur, landing at `at`. A catch's old reading lifts away before it lands. */
export interface RollEvent {
  t: number;
  at: number;
  dur: number;
  phase: boolean;
  land: boolean;
}

/** One direction of a run. */
export class Direction {
  t0 = Infinity;
  t1 = Infinity;
  /** When the meter first reads a rate; until then the number waits at a greyed zero. */
  firstAt = Infinity;
  readonly readings: Reading[] = [];
  /** The reported rate, once the phase has ended. */
  final: number | undefined;
  /** The shortest the phase can run. */
  readonly floor: number;

  constructor(floor: number) {
    this.floor = floor;
  }

  /**
   * The seconds the chart's baseline spans at t: the shortest the phase can
   * run, then as long as it has run, and once it has ended, how long it took.
   * A phase that runs past its floor keeps its head at the end of the line
   * while the line stretches, so progress never jumps to catch up.
   */
  length(t: number): number {
    return Number.isFinite(this.t1) ? this.t1 - this.t0 : Math.max(this.floor, t - this.t0);
  }

  /** The meter's reading at t: the latest at or before it. */
  readingAt(t: number): Reading | undefined {
    const r = this.readings;
    if (!r.length || t < r[0].t) return undefined;
    let lo = 0;
    let hi = r.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (r[m].t <= t) lo = m;
      else hi = m - 1;
    }
    return r[lo];
  }

  /** Adds a reading, holding Gbps until the rate falls back under 950 Mbps so a rate at the line does not flicker. */
  read(t: number, mbps: number): Reading {
    const last = this.readings[this.readings.length - 1];
    const g = last?.g ? mbps >= 950 : mbps >= 999.5;
    const reading = { t, mbps, g };
    this.readings.push(reading);
    return reading;
  }
}

export interface Phases {
  /** When download starts and ends, upload likewise, and when the result starts to form. */
  dl: number;
  dlEnd: number;
  ul: number;
  ulEnd: number;
  r0: number;
}

export class RunData {
  readonly mode: Mode;
  readonly P: Phases = { dl: Infinity, dlEnd: Infinity, ul: Infinity, ulEnd: Infinity, r0: Infinity };
  readonly dirs: [Direction, Direction];
  /** When each ping throw leaves, and the probes so far. */
  readonly throws: number[] = [];
  pings: number[] = [];
  idleMs: number | undefined;
  jitterMs: number | undefined;
  /** Bytes moved so far, both directions. */
  bytes = 0;
  result: Result | undefined;
  /** When the run failed, if it did. */
  failedAt = Infinity;
  readonly events: RollEvent[] = [];
  /** Times the number steps up into Gbps. */
  readonly gigas: number[] = [];
  private catchValues: number[] = [];
  readonly D: Swarm;
  readonly U: Swarm;

  constructor(mode: Mode, swarms: { D: Swarm; U: Swarm }) {
    this.mode = mode;
    this.dirs = [new Direction(MIN_PHASE_SECONDS[mode]), new Direction(MIN_PHASE_SECONDS[mode])];
    this.D = swarms.D;
    this.U = swarms.U;
  }

  /** When throw i comes home. */
  catchAt(i: number): number {
    return this.throws[i] + FLY;
  }

  /**
   * What catch i shows: the median of the probes it stands for. Each throw
   * stands for an equal share of the probes, so the readings close in on
   * the result as they would one probe at a time; the last shows the result.
   */
  catchValue(i: number): number {
    if (this.catchValues[i] !== undefined) return this.catchValues[i];
    const all = this.pings;
    let value: number;
    if (i >= THROWS - 1 && this.idleMs !== undefined) value = this.idleMs;
    else {
      const k = this.idleMs !== undefined ? Math.ceil((all.length * (i + 1)) / THROWS) : all.length;
      value = median(all.slice(0, Math.max(1, k)));
    }
    this.catchValues[i] = value;
    return value;
  }

  /** A ping throw leaves at t; its catch rolls the number. */
  throwAt(t: number): void {
    this.throws.push(t);
    const at = t + FLY;
    this.addEvent({ t: at - CATCH_LEAD, at, dur: CATCH_LEAD + CATCH_SETTLE, phase: false, land: true });
  }

  /** A phase begins at t: the eye rolls into it with the swarm, before the meter's first reading. */
  phaseStart(d: 0 | 1, t: number): void {
    this.dirs[d].t0 = t;
    this.addEvent({ t, at: t, dur: ROLL_PHASE, phase: true, land: false });
    if (d === 0) this.P.dl = t;
    else this.P.ul = t;
    (d ? this.U : this.D).start(t);
  }

  read(d: 0 | 1, t: number, mbps: number): void {
    const dir = this.dirs[d];
    const before = dir.readings[dir.readings.length - 1];
    const reading = dir.read(t, mbps);
    if (mbps > 0 && dir.firstAt === Infinity) dir.firstAt = t;
    if (before && before.g !== reading.g) {
      this.addEvent({ t, at: t, dur: ROLL, phase: false, land: false });
      if (reading.g) this.gigas.push(t);
    }
    (d ? this.U : this.D).feed(t, mbps);
  }

  phaseEnd(d: 0 | 1, t: number, final: number): void {
    const dir = this.dirs[d];
    dir.t1 = t;
    dir.final = final;
    if (d === 0) this.P.dlEnd = t;
    else this.P.ulEnd = t;
    // The number eases onto the result; if the result reads in another unit, that is a roll too.
    const last = dir.readings[dir.readings.length - 1];
    if (last && formatRate(final).unit !== meterUnit(last)) this.addEvent({ t, at: t, dur: ROLL, phase: false, land: false });
    (d ? this.U : this.D).end(t);
  }

  /** Why the run failed, in a sentence for the page. */
  reason = '';

  fail(t: number, reason: string): void {
    this.failedAt = t;
    this.reason = reason;
    this.addEvent({ t, at: t, dur: ROLL_PHASE, phase: true, land: false });
  }

  private addEvent(e: RollEvent): void {
    this.events.push(e);
    this.events.sort((a, b) => a.t - b.t);
  }

  /** A saved run, rebuilt with the timeline it ran on, its swarms flown through and come to rest. */
  static replay(result: Result, swarms: { D: Swarm; U: Swarm }): RunData {
    const run = new RunData(result.mode, swarms);
    run.idleMs = result.latency.idleMs;
    run.jitterMs = result.latency.jitterMs;
    run.result = result;
    run.bytes = result.download.bytes + result.upload.bytes;
    const transfers = [result.download, result.upload];
    let t = 4;
    transfers.forEach((transfer, i) => {
      const d = i as 0 | 1;
      const seconds = Math.max(transfer.seconds, 1);
      run.phaseStart(d, t);
      // The meter as the samples have it, from zero: ten readings a second,
      // or one a second in a run saved before they were kept finer.
      const points = [{ t: 0, mbps: 0 }, ...transfer.samples];
      let k = 0;
      // Asked at a rising time, so the search goes on from the last answer.
      const rateAt = (u: number) => {
        while (k < points.length - 2 && points[k + 1].t < u) k++;
        const a = points[k];
        const b = points[Math.min(k + 1, points.length - 1)];
        return b.t > a.t ? a.mbps + ((b.mbps - a.mbps) * Math.min(1, Math.max(0, (u - a.t) / (b.t - a.t)))) : b.mbps;
      };
      for (const p of points) run.dirs[d].read(t + p.t, p.mbps);
      const sw = d ? run.U : run.D;
      for (let u = 0; u < seconds; u += DT) {
        sw.feed(t + u, rateAt(u));
        sw.advance(t + u);
      }
      run.phaseEnd(d, t + seconds, transfer.mbps);
      t += seconds + (d ? 0 : LAND_DL);
    });
    run.P.r0 = run.P.ulEnd + LAND_UL;
    return run;
  }

  /** When a reopened run is shown: everything settled. */
  get restAt(): number {
    return this.P.r0 + RES_MOVE + 3;
  }
}

export const meterUnit = (r: Reading) => (r.g ? 'Gbps' : 'Mbps');
