// The address and the view meet here, and only here. A navigation of any
// kind (a link, Back and Forward, a reload) arrives in show(); a finished
// run takes its own address in saved(); a press on a link to the page
// already shown arrives in again(). Each decides what the view is, and which
// of the run's moves takes it there.

import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { app } from './stage';
import { ui } from './state.svelte';

/** A result going home under History takes New test's way home this much faster. */
const HIST_PACE = 0.75 / 0.32;

/** A saved run's address. Its id is one segment, whatever it holds. */
export const runHref = (id: string) => resolve('/history/[id]', { id: encodeURIComponent(id) });

/** Set while the address changes under a screen that stays as it is, so no transition is made. */
export let quiet = false;

/** The view an address asks for, and the move there. A run's own page loads its run itself (see routes/history/[id]). */
export function show(route: string | null, id?: string): void {
  const s = app.stage;
  if (route === '/history/[id]') {
    if (id && s && id === s.liveId) ui.view = 'start';
    return;
  }
  const past = ui.view === 'past';
  if (route === '/history') {
    // A reopened run eases back under the list; any other result goes home
    // under it, the way New test takes it.
    if (past) s?.putBack();
    else s?.home(HIST_PACE);
    ui.view = 'list';
    return;
  }
  s?.home(past || ui.view === 'list' ? HIST_PACE : 1);
  ui.view = 'start';
}

/** A link home pressed at home: during a run, it is Stop; after one that failed or was never saved, New test. */
export function again(ev: MouseEvent): void {
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || location.pathname !== resolve('/')) return;
  ev.preventDefault();
  if (ui.view === 'start') app.stage?.home();
}

/** A finished run, saved while it is still the one on screen at home, takes its own address; the screen stays as it is. */
export function saved(id: string): void {
  if (app.stage?.liveId !== id || ui.screen !== 'run' || ui.view !== 'start' || location.pathname !== resolve('/')) return;
  quiet = true;
  void goto(runHref(id), { reset: false })
    .catch(() => {})
    .finally(() => (quiet = false));
}

/** Escape steps back: from the list home, from a run's page to the list. */
export function escape(): void {
  if (ui.view === 'list') void goto(resolve('/')).catch(() => {});
  else if (ui.view !== 'start') void goto(resolve('/history')).catch(() => {});
}
