// What the page is showing, in two values the markup and the stylesheet key
// on (see the motion section of app.css): the view the address asks for,
// and how far the run on screen has come. Everything else is derived from
// them here, or belongs to the one component that shows it.

import type { Mode } from '../engine';

/**
 * start: the run's screen, idle or with a run on it, at home or at the
 * address a finished run takes; list: History; past: a saved run, reopened;
 * loading and missing: a run's address while its run is fetched, or when
 * History hasn't got it.
 */
export type View = 'start' | 'list' | 'past' | 'loading' | 'missing';

/** A run's beats, in order: measuring each phase, measured, its result formed, then settled. */
const BEATS = ['idle', 'latency', 'download', 'upload', 'measured', 'formed', 'settled'] as const;
export type Beat = (typeof BEATS)[number];

export const ui = $state({
  mode: 'adaptive' as Mode,
  view: 'start' as View,
  /** idle; run, from the press of Start to the way home; exit, the way home. */
  screen: 'idle' as 'idle' | 'run' | 'exit',
  /** How much faster than New test's own the way home runs: quicker when History takes the scene home under it. */
  pace: 1,
  beat: 'idle' as Beat,
  /** Why the run on screen stopped short of a result, or empty. */
  failed: '',
});

const reached = (b: Beat) => BEATS.indexOf(ui.beat) >= BEATS.indexOf(b);

export const is = {
  /** History, in any of its views: the bottom key steps aside, Start leaves, the scene dims. */
  get open() {
    return ui.view !== 'start';
  },
  /** A past run on its way back under the list. */
  get back() {
    return ui.view === 'list' && ui.screen === 'run';
  },
  get reopened() {
    return ui.view === 'past' || is.back;
  },
  /** Stop has lit into New test: the result has formed, or the run failed. */
  get lit() {
    return !!ui.failed || reached('formed');
  },
  get formed() {
    return !ui.failed && reached('formed');
  },
  /** A run is measuring at home, for its test ids. */
  get measuring() {
    return ui.view === 'start' && ui.screen === 'run' && !ui.failed && !reached('measured') && ui.beat !== 'idle';
  },
  /** The History key can open History: idle, or a result is up. */
  get canOpen() {
    return ui.view === 'start' && (ui.screen === 'idle' || (ui.screen === 'run' && is.lit));
  },
};
