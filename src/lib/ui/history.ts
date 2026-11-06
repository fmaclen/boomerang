// History: every finished run, newest first, kept on the box, or in this
// browser when the box is set to (see engine/history.ts). It is a
// layer over idle, so the scene carries on behind it, dimmed. A run tapped
// in it reopens as its own result screen, rebuilt from what it measured.
//
// History is the /history route, and a reopened run a shallow entry over it
// at the same address, so the back button steps back the way the History key
// does: from a reopened run to the list, exactly as it was left (the same rows
// loaded, the same scroll, since the list only hides while the run is shown),
// and from the list home. Each entry's state carries its depth, so going home
// from any depth unwinds the entries rather than piling more on. A reload or a
// visit straight to /history opens the list, with no home under it.

import { tick } from 'svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { clearResults, formatBytes, formatMs, listResults, loadResults, type Result } from '../engine';
import { RunData } from '../run/data';
import { EASE_IN_OUT_SINE, EASE_OUT, clamp, lerp, span } from '../scene/math';
import { makeSwarms } from '../scene/swarm';
import { $, $$, setAttr, setStyle } from './dom';
import type { Director } from './director';
import { deviceWords, modeName, whenOf } from './rows';
import { PAGE, ui } from './state.svelte';

/** History's address, under the base path the landing page's demo is served from. */
const LIST = resolve('/history');

/** How much of the scene's light History holds back. */
const HIST_DIM = 0.7;
/**
 * History's moves each finish in about a third of a second, in one stage:
 * what leaves and what arrives move together. Rows in view rise RISE_T each,
 * RISE_STEP apart, on opening and on Load more alike; a result going home
 * under History takes New test's exit at HIST_PACE times its pace, 0.32 s.
 */
const RISE_T = 0.2;
const RISE_STEP = 0.01;
const HIST_PACE = 0.75 / 0.32;

/** A value that eases to wherever it is sent, from wherever it is, so a change of mind mid-move never jumps. */
interface Tween {
  a: number;
  b: number;
  at: number;
  dur: number;
  ease: (x: number) => number;
}
const tween = (v: number): Tween => ({ a: v, b: v, at: 0, dur: 0, ease: EASE_OUT });
const tv = (w: Tween, now: number) => (w.dur <= 0 ? w.b : lerp(w.a, w.b, w.ease(span(now - w.at, 0, w.dur))));
function tto(w: Tween, b: number, now: number, dur: number, ease = EASE_OUT, delay = 0): void {
  w.a = tv(w, now);
  w.b = b;
  w.at = now + delay;
  w.dur = dur;
  w.ease = ease;
}
function tset(w: Tween, v: number): void {
  w.a = w.b = v;
  w.dur = 0;
}

/** History's state this frame, for the director and the scene. */
export interface HistNow {
  open: boolean;
  reopened: boolean;
  /** Start hidden, the bottom key stepped aside, the list shown, a reopened run's scene shown. */
  disc: number;
  dock: number;
  list: number;
  rv: number;
  /** How far a reopened run's numbers, instruments and details are up; 1 for any other run. */
  res: number;
  inst: number[];
  where: number;
  dim: number;
}

const secs = () => performance.now() / 1000;

export class HistoryNav {
  open = false;
  /** The reopened run, and whether it is on its way back to the list. */
  run: RunData | null = null;
  private back = false;
  private clearAt = -1;
  private listAt = 0;
  private lay = tween(0);
  private disc = tween(0);
  private dock = tween(0);
  private list = tween(0);
  private rv = tween(0);
  private uiT = tween(0);
  private uiAt = 0;
  private emptyT = RISE_T;
  private order: number[] = [];
  private seen = 0;
  private seenAt = -1;
  /** How many of this page's entries sit above home in the browser's history; 0 at home, or when the visit began at /history. */
  private depth = 0;
  /** Whether the page has followed an address yet: a load or reload at /history opens the list already in place, with no idle before it. */
  private routed = false;
  private d: Director;
  private el;

  constructor(d: Director) {
    this.d = d;
    this.el = {
      menu: $<HTMLAnchorElement>('menu'),
      hist: $('hist'),
      table: $$('.hist-table')[0],
      head: $('histHead'),
      scroll: $('histScroll'),
      list: $('histList'),
      foot: $('histFoot'),
      more: $<HTMLButtonElement>('histMore'),
      clear: $<HTMLButtonElement>('histClear'),
      no: $<HTMLButtonElement>('histNo'),
      yes: $<HTMLButtonElement>('histYes'),
      empty: $('histEmpty'),
      where: $('where'),
    };
  }

  get dimK(): number {
    return HIST_DIM;
  }

  wire(kick: (n: HTMLElement) => void): void {
    const el = this.el;
    // A click with a modifier is the browser's (a new tab, a new window), as on the logo.
    el.menu.addEventListener('click', (ev) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      this.key();
    });
    el.list.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      const li = target.closest<HTMLElement>('.row');
      if (li?.dataset.id && target.closest('.run')) this.openRun(li.dataset.id);
    });
    el.more.addEventListener('click', () => void this.loadMore());
    el.clear.addEventListener('click', () => {
      if (ui.ask || this.clearAt >= 0) return;
      ui.ask = true;
      el.no.focus({ preventScroll: true });
    });
    el.no.addEventListener('click', () => {
      ui.ask = false;
      el.clear.focus({ preventScroll: true });
    });
    el.yes.addEventListener('click', () => this.clearAll());
    for (const n of [el.clear, el.no, el.yes]) n.addEventListener('pointerdown', () => kick(n));
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !this.open) return;
      if (ui.ask) el.no.click();
      else this.key();
    });
  }

  /** History runs from under the top bar to the foot of the bottom key's slot, in the top bar's width on a wide screen and edge to edge on a phone; its empty state sits where Start does. */
  layout(wide: boolean, idleCy: number): void {
    const el = this.el;
    const tb = $$('.top')[0].getBoundingClientRect();
    const dk = $('dock').getBoundingClientRect();
    const hTop = tb.bottom + (wide ? 40 : 20);
    setStyle(el.hist, 'left', `${wide ? tb.left : 0}px`);
    setStyle(el.hist, 'width', `${wide ? tb.width : document.documentElement.clientWidth}px`);
    setStyle(el.hist, 'top', `${hTop}px`);
    setStyle(el.hist, 'height', `${Math.max(0, dk.bottom - hTop)}px`);
    setStyle(el.empty, 'top', `${idleCy - hTop}px`);
    // A new size centres the list again.
    this.pin(false);
  }

  /**
   * On a wide screen the layer centres the table and its actions while they
   * fit (justify-center). Pinning holds their top where it is, so rows added
   * under the last grow the list downwards, and once it reaches the foot of
   * the layer the table scrolls; nothing already on screen moves.
   */
  private pin(on: boolean): void {
    const el = this.el;
    const top = el.scroll.getBoundingClientRect().top - el.hist.getBoundingClientRect().top;
    setStyle(el.hist, 'padding-top', on ? `${top}px` : '');
    el.hist.classList.toggle('pinned', on);
  }

  private canOpen(): boolean {
    return !this.open && (this.d.clock.screen === 'idle' || (this.d.resultUp() && !this.run));
  }

  // ---------------------------------------------------------------------------
  // Navigation: presses push or unwind entries, and the layer follows the
  // address. Each move starts on the press; route() then sees the entry the
  // press made and has nothing left to do.

  /** The History key opens History; in it, it steps back: from a reopened run to the list, and from the list home. Escape does the same. */
  private key(): void {
    if (!this.open) {
      if (!this.canOpen()) return;
      this.go(LIST, { depth: 1 });
      this.show();
    } else if (this.run && !this.back) history.back();
    else if (this.depth >= 1) history.back();
    else this.leave();
  }

  /** The logo: straight home from any depth. */
  home(): void {
    if (this.depth > 0) history.go(-this.depth);
    else this.leave();
  }

  /** Home from a visit that began at /history: there is no entry to go back to, so home takes this one's place. */
  private leave(): void {
    void goto(resolve('/') + location.search, { replace: true, reset: false });
    this.close();
  }

  private openRun(id: string): void {
    if (!this.open || this.run || this.d.clock.screen !== 'idle' || tv(this.list, secs()) < 0.99) return;
    const r = ui.runs.find((x) => x.id === id);
    if (!r) return;
    this.go(LIST, { run: id, depth: this.depth && this.depth + 1 }, true);
    this.reopen(r);
  }

  /** A new entry; a reopened run's is shallow, over the list at the same address. Focus and scroll stay where they are. */
  private go(path: string, state: App.PageState, shallow = false): void {
    void goto(path + location.search, { state, shallow, reset: false });
    this.depth = state.depth ?? 0;
  }

  /** Follows the address, on every navigation and on the back and forward buttons: /history is the list, a run in its state is reopened over it, and anywhere else is home. */
  route(path: string, state: App.PageState): void {
    this.depth = state.depth ?? 0;
    if (path === LIST && state.run) {
      const r = ui.runs.find((x) => x.id === state.run);
      if (this.open && !this.run && r && this.d.clock.screen === 'idle') this.reopen(r);
    } else if (path === LIST) {
      if (this.run && !this.back) this.backToList();
      else if (!this.open && this.d.clock.screen === 'idle') this.show(!this.routed);
    } else if (this.open) this.close();
    this.routed = true;
  }

  // ---------------------------------------------------------------------------
  // The moves

  /** History is for reading: the bottom key steps aside whole as it opens, and comes back as Quick and Long when it closes. */
  private show(instant = false): void {
    const now = secs();
    const fromResult = this.d.clock.screen === 'run';
    if (tv(this.list, now) < 0.01) {
      ui.runs = listResults();
      ui.shown = PAGE;
      ui.ask = false;
      ui.now = Date.now();
      this.el.scroll.scrollTo(0, 0);
      this.pin(false);
      this.listAt = now + (fromResult ? 0.04 : 0);
      this.emptyT = RISE_T;
    }
    this.open = true;
    // What is held shows at once; runs taken since, in any browser, join the rows in place when they land.
    void loadResults().then((runs) => {
      if (this.open && !sameRuns(runs, ui.runs)) ui.runs = runs;
    });
    if (instant) {
      for (const w of [this.lay, this.list, this.dock, this.disc]) tset(w, 1);
      this.listAt = now - 1;
      return;
    }
    tto(this.lay, 1, now, 0.3);
    tto(this.list, 1, now, 0.2);
    tto(this.dock, 1, now, 0.25);
    // From a result the scene goes home under the layer, the way New test takes it.
    if (fromResult) {
      this.d.pressAction(HIST_PACE);
      tset(this.disc, 1);
    } else tto(this.disc, 1, now, 0.25);
  }

  private close(): void {
    if (!this.open) return;
    const now = secs();
    this.open = false;
    this.back = false;
    ui.ask = false;
    tto(this.lay, 0, now, 0.26);
    tto(this.list, 0, now, 0.18);
    if (this.run) {
      // A reopened run goes home the way any result does, at History's pace.
      if (this.d.clock.screen === 'run') this.d.pressAction(HIST_PACE);
      tset(this.disc, 0);
      tto(this.dock, 0, now, 0.24, EASE_OUT, 0.08);
    } else {
      tto(this.disc, 0, now, 0.22, EASE_OUT, 0.04);
      tto(this.dock, 0, now, 0.22, EASE_OUT, 0.04);
    }
  }

  /** A run reopens as its own result: the list leaves, and the scene glides from idle to the settled swarm as its numbers, charts and details come up over it. */
  private reopen(r: Result): void {
    ui.ask = false;
    const data = RunData.replay(r, makeSwarms(this.d.seed));
    this.run = data;
    this.back = false;
    this.d.showReplay(data);
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
    const now = secs();
    void tick().then(() => this.d.placeWhere());
    tto(this.list, 0, now, 0.18);
    tto(this.rv, 1, now, 0.34, EASE_IN_OUT_SINE);
    tset(this.uiT, 1);
    this.uiAt = now + 0.06;
  }

  /** The words go first, the scene glides home under them, and the rows rise. */
  private backToList(): void {
    if (!this.run || this.back || this.d.clock.screen !== 'run') return;
    const now = secs();
    this.back = true;
    tto(this.uiT, 0, now, 0.15);
    tto(this.rv, 0, now, 0.32, EASE_IN_OUT_SINE);
    tset(this.list, 1);
    this.listAt = now + 0.04;
  }

  /** Load more: the next ten rows rise in under the last at the pace the list opens with, those in view one after another. */
  private async loadMore(): Promise<void> {
    this.pin(true);
    const from = ui.shown;
    ui.shown = Math.min(ui.runs.length, from + PAGE);
    await tick();
    const rows = this.rows().slice(from);
    if (!this.d.reduced) {
      const order = this.inView(rows);
      rows.forEach((li, k) => {
        if (order[k] < 0) return;
        li.animate([{ opacity: 0, translate: '0 12px' }, { opacity: 1, translate: '0 0' }], {
          duration: RISE_T * 1000,
          delay: 1000 * RISE_STEP * order[k],
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
          fill: 'backwards',
        });
      });
    }
    // Focus moves to the first new run, since the key may be gone.
    rows[0]?.querySelector<HTMLElement>('.run')?.focus({ preventScroll: true });
  }

  /** Every run goes: the rows fade, then the empty state comes up. */
  private clearAll(): void {
    ui.ask = false;
    tto(this.list, 0, secs(), 0.3);
    this.clearAt = secs() + 0.25;
    this.el.menu.focus({ preventScroll: true });
  }


  // ---------------------------------------------------------------------------
  // Every frame

  /** Hand-overs that happen on their own: a closed result reaching home, a reopened run back under the list, the rows cleared. */
  tick(now: number): void {
    const d = this.d;
    // A reopened run that has eased back under the list hands over to idle, whose clock never stopped behind it.
    if (this.run && this.back && d.clock.screen === 'run' && tv(this.rv, now) <= 0) {
      this.run = null;
      this.back = false;
      d.endReplay();
    }
    if (this.clearAt >= 0 && now >= this.clearAt) {
      this.clearAt = -1;
      void clearResults();
      ui.runs = [];
      if (this.open) {
        tset(this.list, 1);
        this.listAt = now;
        this.emptyT = 0.5;
      }
    }
    // Relative times move on while the list is up.
    if (this.open && Date.now() - ui.now > 30000) ui.now = Date.now();
  }

  /** New test's way home has ended: a reopened run is put away. */
  homeFromRun(): void {
    if (this.run) {
      this.run = null;
      tset(this.rv, 0);
    }
    this.d.data = null;
  }

  now(now: number): HistNow {
    const reopened = !!this.run && this.d.clock.screen === 'run';
    // A reopened run's words and instruments rise in one after another from
    // uiAt, the way a run's arrive, and leave together, quickly, on the way back.
    const u = reopened ? tv(this.uiT, now) : 1;
    const enter = (delay: number) => (reopened ? EASE_OUT(span(now - this.uiAt - delay, 0, 0.22)) * u : 1);
    const lay = tv(this.lay, now);
    const rv = reopened ? tv(this.rv, now) : 1;
    return {
      open: this.open,
      reopened,
      disc: tv(this.disc, now),
      dock: tv(this.dock, now),
      list: tv(this.list, now),
      rv,
      res: enter(0),
      inst: [enter(0.02), enter(0.04), reopened ? 0 : 1],
      where: reopened ? enter(0.06) : 0,
      dim: lay * (1 - (reopened ? rv : 0)),
    };
  }

  private rows(): HTMLElement[] {
    return [...this.el.list.children] as HTMLElement[];
  }

  /** The rows in view, in order: each one's step in the rise, or -1 for a row past the view, which is simply there. */
  private inView(rows: HTMLElement[]): number[] {
    const sc = this.el.scroll;
    const top = sc.scrollTop;
    const bottom = top + sc.clientHeight;
    let k = 0;
    const order = rows.map((li) => (li.offsetTop < bottom && li.offsetTop + li.offsetHeight > top ? k++ : -1));
    this.seen = k;
    return order;
  }

  /** The layer's own parts: the History key's light, the rows, the empty state. */
  draw(now: number, h: HistNow): void {
    const el = this.el;
    const MOVE = this.d.reduced ? 0 : 1;
    el.menu.classList.toggle('on', this.open);
    setAttr(el.menu, 'aria-current', this.open ? 'page' : null);
    // The key goes grey and does nothing while a run is going, and during New test's way home.
    const off = !(this.open || this.canOpen());
    setAttr(el.menu, 'href', off ? null : '/history');
    setAttr(el.menu, 'role', off ? 'link' : null);
    setAttr(el.menu, 'aria-disabled', off ? 'true' : null);
    setStyle(el.where, 'opacity', h.where.toFixed(3));
    setStyle(el.where, 'visibility', h.where > 0.002 ? 'visible' : 'hidden');
    setStyle(el.where, 'translate', `0 ${((1 - h.where) * 8 * MOVE).toFixed(2)}px`);
    const listOn = this.open && !this.run;
    el.hist.inert = !listOn;
    el.hist.classList.toggle('on', listOn && h.list > 0.5);
    setStyle(el.hist, 'visibility', h.list > 0.002 ? 'visible' : 'hidden');
    if (h.list <= 0.002) return;
    // The list fades out at its foot and right edge only where rows run on
    // past them. Rows scrolled under the heads, or sideways under When, pass
    // behind ground.
    const hs = el.scroll;
    const sc = hs.scrollTop;
    const more = hs.scrollHeight - hs.clientHeight - sc;
    setStyle(hs, '--fade-b', `${clamp(more, 0, 40).toFixed(1)}px`);
    setStyle(el.table, '--fade-r', `${clamp(hs.scrollWidth - hs.clientWidth - hs.scrollLeft, 0, 32).toFixed(1)}px`);
    setStyle(el.table, '--edge', `${(hs.scrollLeft + hs.clientWidth).toFixed(1)}px`);
    hs.classList.toggle('down', sc > 0);
    hs.classList.toggle('slid', hs.scrollLeft > 0);
    // The rows in view rise in one after another at one even pace, and the
    // list's actions come up next, as one more step; rows past the foot of
    // the view are simply there. All leave together, dropping as they fade.
    const rows = this.rows();
    if (this.seenAt !== this.listAt || this.order.length !== rows.length) {
      if (this.seenAt !== this.listAt) this.order = this.inView(rows);
      else while (this.order.length < rows.length) this.order.push(-1);
      this.order.length = rows.length;
      this.seenAt = this.listAt;
    }
    const drop = (1 - h.list) * 6 * MOVE;
    const rise = (k: number) => (k < 0 ? 1 : EASE_OUT(span(now - this.listAt - RISE_STEP * k, 0, RISE_T)));
    const empty = ui.runs.length === 0;
    const head = empty ? 0 : rise(0);
    setStyle(el.head, 'opacity', (head * h.list).toFixed(3));
    setStyle(el.head, 'translate', `0 ${((1 - head) * 12 * MOVE + drop).toFixed(2)}px`);
    [...rows, el.foot].forEach((n, i) => {
      const x = rise(i < rows.length ? (this.order[i] ?? -1) : this.seen);
      setStyle(n, 'opacity', (x * h.list).toFixed(3));
      setStyle(n, 'translate', `0 ${((1 - x) * 12 * MOVE + drop).toFixed(2)}px`);
    });
    const ex = empty ? EASE_OUT(span(now - this.listAt, 0, this.emptyT)) : 0;
    setStyle(el.empty, 'visibility', ex * h.list > 0.002 ? 'visible' : 'hidden');
    setStyle(el.empty, 'opacity', (ex * h.list).toFixed(3));
    setStyle(el.empty, 'transform', `translateY(calc(-50% + ${((1 - ex) * 8 * MOVE + drop).toFixed(2)}px))`);
  }
}

function sameRuns(a: Result[], b: Result[]): boolean {
  return a.length === b.length && a.every((r, i) => r.id === b[i].id);
}
