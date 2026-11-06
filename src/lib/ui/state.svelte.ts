// What the markup renders from: the chosen mode, the saved runs History
// lists, and a reopened run's details. Everything that moves every frame is
// set by the director instead (see director.ts).

import { listResults, type Mode, type Result } from '../engine';

/** The list shows the latest ten, and ten more at a time. */
export const PAGE = 10;

export interface Detail {
  label: string;
  /** A figure, its digits and unit apart; or a word; or a device with its system's mark. */
  value?: string;
  unit?: string;
  text?: string;
  os?: string;
  mark?: string;
}

export const ui = $state({
  mode: 'adaptive' as Mode,
  runs: listResults() as Result[],
  shown: PAGE,
  /** The clock History's relative times are counted from. */
  now: Date.now(),
  /** Whether Clear history is asking to confirm. */
  ask: false,
  details: [] as Detail[],
});
