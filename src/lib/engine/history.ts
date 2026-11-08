import { pastRuns } from './simulate';
import { parseResult, parseSummary, summaryOf } from './stored';
import type { HistoryMode, Result, Summary } from './types';

// Where finished runs are kept. On a box (the default) they live in the box's
// store under /runs, so every browser sees the same History; a box started
// with HISTORY=browser keeps them in each browser's localStorage instead, and
// says so the first time the page asks /runs for a list. The demo has no box,
// so it is always the latter. Nothing here holds the page up: the home screen
// never asks for runs, and every request gives up after REQUEST_MS.

/** This browser's own runs: a JSON array of Result, newest first. */
const HISTORY_KEY = 'boomerang.history';
/** History shows ten runs, and ten more at a time. */
export const PAGE = 10;
const REQUEST_MS = 5000;

/** Where runs are kept, once known. */
let mode: HistoryMode | undefined = import.meta.env.MODE === 'demo' ? 'browser' : undefined;
/** Whole runs this page already has: ones it ran, and ones it reopened. */
const held = new Map<string, Result>();
/** Runs this page finished that the box has not confirmed yet, listed until it does. */
let unsaved: Result[] = [];

/** Bumped by every clear, so a list that set out before one cannot bring its runs back. */
let generation = 0;

/** Where runs are kept: known once History has been listed, and the box until then. */
export const historyMode = (): HistoryMode => mode ?? 'box';

export interface Page {
  runs: Summary[];
  more: boolean;
  /** Where the next page starts in the store: counted in stored runs, not rows shown. */
  next: number;
  /** The box could not be reached: only this page's own runs are listed. */
  failed?: boolean;
}

/**
 * A page of runs, newest first, from the store's from-th; null when a clear
 * has happened since it was asked for. A run this page finished shows at
 * once on the first page, whether or not the box has taken it yet.
 */
export async function listRuns(from: number): Promise<Page | null> {
  const asked = generation;
  if (mode === 'browser') {
    const all = readLocal();
    return { runs: all.slice(from, from + PAGE).map(summaryOf), more: all.length > from + PAGE, next: from + PAGE };
  }
  const body = await request(`/runs?from=${from}`).then((r) => (r?.ok ? r.json() : null)).catch(() => null);
  if (asked !== generation) return null;
  if (body?.history === 'browser') {
    mode = 'browser';
    return listRuns(from);
  }
  const mine = from ? [] : unsaved.map(summaryOf);
  if (!body || !Array.isArray(body.runs)) return { runs: mine, more: false, next: from, failed: true };
  mode = 'box';
  const runs = body.runs.map(parseSummary).filter((r: Summary | null): r is Summary => !!r);
  const missing = mine.filter((u) => !runs.some((r: Summary) => r.id === u.id));
  return { runs: [...missing, ...runs].sort((a, b) => b.startedAt - a.startedAt), more: body.more === true, next: from + body.runs.length };
}

/** A whole run, samples and all, to reopen it. */
export async function getRun(id: string): Promise<Result | null> {
  if (!mode) await listRuns(0);
  const known = held.get(id) ?? (mode === 'browser' ? readLocal().find((r) => r.id === id) : undefined);
  if (known) return known;
  if (mode === 'browser') return null;
  const run = parseResult(await request(`/runs/${encodeURIComponent(id)}`).then((r) => (r?.ok ? r.json() : null)).catch(() => null));
  if (run) held.set(run.id, run);
  return run;
}

/** Keeps a finished run. Resolves whether it was kept; a box that cannot take it does not fail the run, which stays listed in this page. */
export async function saveRun(run: Result): Promise<boolean> {
  held.set(run.id, run);
  if (!mode) await listRuns(0);
  if (mode === 'browser') return writeLocal([run, ...readLocal().filter((r) => r.id !== run.id)]);
  unsaved = [run, ...unsaved];
  const response = await request('/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(run) });
  if (!response?.ok) return false;
  unsaved = unsaved.filter((u) => u.id !== run.id);
  return true;
}

/** Empties History: the box's store, or this browser's own runs, and every run this page holds. Resolves whether it did. */
export async function clearRuns(): Promise<boolean> {
  generation++;
  // Typed, so the server does not take it for a cross-site form submission
  // (a DELETE can't be sent cross-site without the box's say-so anyway).
  const ok = mode === 'browser' ? writeLocal([]) : !!(await request('/runs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }))?.ok;
  if (!ok) return false;
  generation++;
  unsaved = [];
  held.clear();
  return true;
}

function request(path: string, init: RequestInit = {}): Promise<Response | null> {
  return fetch(path, { ...init, cache: 'no-store', signal: AbortSignal.timeout(REQUEST_MS) }).catch(() => null);
}

// Storage can be off or full, and its contents are this browser's to damage:
// every read is checked run by run, and a failed write says so.
function readLocal(): Result[] {
  try {
    let raw = localStorage.getItem(HISTORY_KEY);
    if (raw === null && import.meta.env.MODE === 'demo') {
      raw = JSON.stringify(pastRuns());
      localStorage.setItem(HISTORY_KEY, raw);
    }
    const parsed: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed.map(parseResult).filter((r): r is Result => !!r) : [];
  } catch {
    return [];
  }
}

function writeLocal(runs: Result[]): boolean {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(runs));
    return true;
  } catch {
    return false;
  }
}
