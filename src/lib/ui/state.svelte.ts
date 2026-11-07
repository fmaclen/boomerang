// What the markup renders from. The page's choreography is CSS keyed on these
// (see the motion section of app.css): a change here starts a move, and the
// stylesheet carries it through on the run's own durations and curves. Only
// what follows live readings is moved from script (see stage.ts).

import type { Mode, Summary } from '../engine';

export interface Detail {
  label: string;
  /** A figure, its digits and unit apart; or a word; or a device with its system's mark. */
  value?: string;
  unit?: string;
  text?: string;
  os?: string;
  mark?: string;
}

export interface Stat {
  value: string;
  unit: string;
  /** Measured yet: until then it is a greyed zero in its reading's shape. */
  lit: boolean;
}

export const ui = $state({
  mode: 'adaptive' as Mode,
  /** idle; run, from the press of Start to the way home; exit, the way home. */
  screen: 'idle' as 'idle' | 'run' | 'exit',
  /** How much faster than New test's own the way home runs: quicker when History takes the scene home under it. */
  pace: 1,
  /** Stop has lit into New test: the result has formed, or the run failed. */
  lit: false,
  /** The result has formed, and its upload line has taken over from the live number. */
  formed: false,
  landed: false,
  settled: false,
  /** The phase a measuring run is in, for its test id; empty otherwise. */
  phase: '' as '' | 'latency' | 'download' | 'upload',
  /** Each direction's phase has begun, which lights its chart's name. */
  dirOn: [false, false],
  progress: 0,
  stats: [] as Stat[],

  /** The list is the page (/history); a past run is shown (/history/[id]); either is History, open. */
  list: false,
  reopened: false,
  open: false,
  /** /history/[id] names a run History doesn't have. */
  missing: false,
  /** Home just took over from the list, so Start comes back the way it left. */
  closing: false,
  /** A reopened run on its way back to the list. */
  back: false,
  /** The History key can open History now: idle, or a result is up. */
  canOpen: true,
  runs: [] as Summary[],
  /** Loaded at least once since History opened, so an empty list means none. */
  loaded: false,
  more: false,
  /** Whether Clear history is asking to confirm, and whether the last clear failed. */
  ask: false,
  clearFailed: false,
  /** The clock History's relative times are counted from. */
  now: Date.now(),
  details: [] as Detail[],
});
