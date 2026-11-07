// History: every finished run, newest first, kept on the box, or in this
// browser when the box is set to (see engine/history.ts). Its list is the
// /history page, over the idle scene, dimmed; a run has its own page,
// /history/[id], shown as its own result, rebuilt from what it measured. A
// run that has just finished takes its page's address once it is saved, so
// back and forward walk home, the list and each run like any other site.
//
// The address decides what is shown; this makes the moves between: the
// scene's crossfade into a reopened run (rv), which the camera follows, the
// list's rows rising in, and the rows leaving on a clear. The rest is CSS
// (see app.css) and the view transition the layout starts on navigation.

import { tick } from 'svelte';
import { clearRuns, formatBytes, formatMs, getRun, listRuns, type Result } from '../engine';
import { RunData } from '../run/data';
import { EASE_IN_OUT_SINE, lerp, span } from '../scene/math';
import { makeSwarms } from '../scene/swarm';
import { deviceWords, modeName, whenOf } from './rows';
import type { Stage } from './stage';
import { ui } from './state.svelte';

/**
 * Rows in view rise RISE_T each, RISE_STEP apart, on opening and on Load
 * more alike, and leave the same way on a clear; the empty state rises over
 * EMPTY_T, slower after a clear. A result going home under History takes New
 * test's exit at HIST_PACE times its pace.
 */
const RISE_T = 200;
const RISE_STEP = 10;
const EMPTY_T = [200, 500];
const HIST_PACE = 0.75 / 0.32;
/** The scene's crossfade into a reopened run, and back out of it. */
const RV_IN = 0.34;
const RV_OUT = 0.32;
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';

const secs = () => performance.now() / 1000;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

export class History {
  /** The reopened run. */
  private run: RunData | null = null;
  /** The scene's crossfade into the reopened run: from a, to b, from at over dur. */
  private fade = { a: 0, b: 0, at: 0, dur: 0 };
  private clearing = false;
  /** The address last followed, so a reopen that lands late knows it is still wanted. */
  private at = '';

  constructor(private stage: Stage) {}

  rv(now: number): number {
    const f = this.fade;
    return lerp(f.a, f.b, EASE_IN_OUT_SINE(span(now - f.at, 0, f.dur)));
  }

  private fadeTo(b: number, dur: number): void {
    const now = secs();
    this.fade = { a: this.rv(now), b, at: now, dur };
  }

  /** Follows the address: home, the list, or one run. */
  route(id: string | null, runId?: string): void {
    this.at = runId ?? id ?? '';
    const s = this.stage;
    const live = s.data?.result && !this.run && ui.screen === 'run' ? s.data.result.id : undefined;
    ui.missing = false;
    if (id === '/history/[id]' && runId) {
      // A run that has just finished takes its own address: nothing moves.
      if (runId === live) return;
      ui.list = false;
      void getRun(runId).then((r) => {
        if (this.at !== runId) return;
        if (r) this.reopen(r);
        else Object.assign(ui, { missing: true, open: false });
      });
      return;
    }
    if (id === '/history') {
      const fromResult = ui.screen === 'run';
      Object.assign(ui, { list: true, open: true, ask: false, clearFailed: false, now: Date.now() });
      void tick().then(() => this.listShown());
      // A reopened run eases back under the list; any other result goes home
      // under it, the way New test takes it.
      if (this.run && ui.screen === 'run') {
        ui.back = true;
        this.fadeTo(0, RV_OUT);
      } else if (fromResult) s.pressAction(HIST_PACE);
      return;
    }
    // Home.
    const fromList = ui.list;
    if (ui.screen === 'run') {
      if (this.run) ui.reopened = false;
      s.pressAction(this.run || fromList ? HIST_PACE : 1);
    }
    Object.assign(ui, { list: false, open: false, back: false, ask: false, closing: fromList });
    if (fromList) setTimeout(() => (ui.closing = false), 400);
  }

  /** A run reopens as its own result: the scene glides from idle to the settled swarm as its numbers, charts and details come up over it. */
  private reopen(r: Result): void {
    const data = RunData.replay(r, makeSwarms(this.stage.seed));
    this.run = data;
    const ping = formatMs(r.latency.idleMs);
    const jitter = formatMs(r.latency.jitterMs);
    const bytes = formatBytes(r.download.bytes + r.upload.bytes);
    const device = deviceWords(r.device);
    // In the History row's order: when, what it measured, then how and on what it ran.
    ui.details = [
      { label: 'When', text: whenOf(r.startedAt, Date.now()) },
      { label: 'Ping', value: ping.value, unit: ping.unit },
      { label: 'Jitter', value: jitter.value, unit: jitter.unit },
      { label: 'Data used', value: bytes.value, unit: bytes.unit },
      { label: 'Mode', text: modeName(r.mode) },
      { label: 'Device', text: device.text, os: device.os, mark: device.mark },
      { label: 'Browser', text: r.device?.browser || 'Unknown' },
    ];
    this.stage.showReplay(data);
    Object.assign(ui, { reopened: true, open: true, back: false, list: false, ask: false });
    void tick().then(() => this.stage.placeWhere());
    this.fadeTo(1, RV_IN);
  }

  /** The list has come up: what is held rises in at once; runs taken since, in any browser, join the rows in place when they land. */
  private listShown(): void {
    void this.rise(ui.back || ui.screen !== 'idle' ? 40 : 0);
    void listRuns(0).then((page) => {
      if (!ui.list || !page) return;
      // The rows already loaded stay, unless the newest have changed.
      if (ui.loaded && page.runs.every((r, i) => r.id === ui.runs[i]?.id)) return;
      Object.assign(ui, { runs: page.runs, more: page.more, loaded: true });
      void this.rise(0);
    });
  }

  /** Load more: the next ten rows rise in under the last at the pace the list opens with, those in view one after another. */
  async loadMore(): Promise<void> {
    const page = await listRuns(ui.runs.length);
    if (!page || !ui.list) return;
    this.pin(true);
    const from = ui.runs.length;
    const fresh = page.runs.filter((r) => !ui.runs.some((x) => x.id === r.id));
    Object.assign(ui, { runs: [...ui.runs, ...fresh], more: page.more });
    await tick();
    const rows = [...document.querySelectorAll<HTMLElement>('#histList > li')].slice(from);
    this.inView(rows).forEach((li, k) => move(li, true, RISE_STEP * k, RISE_T));
    // Focus moves to the first new run, since the key may be gone.
    rows[0]?.querySelector('a')?.focus({ preventScroll: true });
  }

  /**
   * Every run goes: the heads, the rows in view one after another and the
   * list's actions leave the way they rose, then the empty state comes up
   * where Start sits. Nothing is taken out until it has gone, so nothing on
   * screen moves. A clear the box refuses brings them all back, and says so.
   */
  async clearAll(): Promise<void> {
    if (this.clearing) return;
    this.clearing = true;
    Object.assign(ui, { ask: false, clearFailed: false });
    document.getElementById('menu')?.focus({ preventScroll: true });
    const parts = this.parts();
    const out = parts.map((n, k) => move(n, false, RISE_STEP * k, RISE_T));
    const [ok] = await Promise.all([clearRuns(), ...out.map((a) => a.finished)]);
    this.clearing = false;
    if (ok) {
      Object.assign(ui, { runs: [], more: false });
      await tick();
      for (const a of out) a.cancel();
      this.riseEmpty(EMPTY_T[1]);
    } else {
      for (const a of out) a.reverse();
      ui.clearFailed = true;
    }
  }

  // ---------------------------------------------------------------------------

  /** A reopened run that has eased back under the list hands over to idle, whose clock never stopped behind it; relative times move on while the list is up. */
  tick(now: number): void {
    if (this.run && ui.back && ui.screen === 'run' && now - this.fade.at >= this.fade.dur) {
      this.run = null;
      Object.assign(ui, { reopened: false, back: false });
      this.stage.toIdle();
    }
    if (ui.list && Date.now() - ui.now > 30000) ui.now = Date.now();
  }

  /** The way home has ended: a reopened run is put away. */
  homeFromRun(): void {
    this.run = null;
    this.fade = { a: 0, b: 0, at: 0, dur: 0 };
    ui.reopened = false;
  }

  /**
   * On a wide screen the list sits centred while it fits. Pinning holds its
   * top where it is, so rows added under the last grow it downwards; nothing
   * already on screen moves.
   */
  private pin(on: boolean): void {
    const hist = document.getElementById('hist');
    const table = document.getElementById('histScroll');
    if (!hist || !table) return;
    hist.style.paddingTop = on ? `${table.getBoundingClientRect().top - hist.getBoundingClientRect().top}px` : '';
    hist.classList.toggle('pinned', on);
  }

  /** The heads, the rows in view, then the list's actions: what rises and leaves, in order. */
  private parts(): HTMLElement[] {
    const rows = this.inView([...document.querySelectorAll<HTMLElement>('#histList > li')]);
    return [document.getElementById('histHead'), ...rows, document.getElementById('histFoot')].filter((n): n is HTMLElement => !!n);
  }

  /** The rows on screen; those past it are simply there. */
  private inView(rows: HTMLElement[]): HTMLElement[] {
    return rows.filter((li) => {
      const r = li.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    });
  }

  /** Everything in view rises in one after another at one even pace. */
  private async rise(delay: number): Promise<void> {
    this.pin(false);
    await tick();
    if (!ui.runs.length) return this.riseEmpty(EMPTY_T[0], delay);
    const parts = this.parts();
    // The actions come up as one more step after the last row in view.
    parts.forEach((n, k) => move(n, true, delay + RISE_STEP * k, RISE_T));
  }

  private riseEmpty(duration: number, delay = 0): void {
    const n = document.getElementById('histEmpty');
    if (n) move(n, true, delay, duration, 8);
  }
}

/** One element rising into place, up dy px as it fades in, or leaving the way it came, on the page's strong ease-out. */
function move(n: HTMLElement, entering: boolean, delay: number, duration: number, dy = 12): Animation {
  if (REDUCED) dy = 0;
  const away = { opacity: 0, translate: `0 ${entering ? dy : 6}px` };
  const here = { opacity: 1, translate: '0 0' };
  return n.animate(entering ? [away, here] : [here, away], { duration, delay, easing: EASE, fill: entering ? 'backwards' : 'forwards' });
}
