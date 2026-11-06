import type { HistoryMode, Result } from './types';

// Where finished runs are kept. On a box (the default) they live in the box's
// store under /runs, so every browser sees the same History; with the shell's
// boomerang-history tag set to `browser` they stay in this browser's
// localStorage and the page never calls /runs. Either way the page reads a
// copy held here, newest first, which loadResults fills.

/** This browser's own runs: a JSON array of Result, newest first. */
export const HISTORY_KEY = 'boomerang.history';
/** Set once this browser's own runs have been sent to the box, so a later Clear stays cleared. */
const IMPORTED_KEY = 'boomerang.imported';
/** How long a load waits on the box before showing what it has; a dead store must not hang the page. */
const LOAD_MS = 2000;

let runs: Result[] = [];
/** Finished runs the box did not take, kept in this page's list until a Clear. */
let unsaved: Result[] = [];
/** Bumped by every save and clear, so a load that started before one cannot undo it when it lands. */
let version = 0;

/** Where this box keeps runs, read from the shell's boomerang-history tag. The landing page's demo has no box, so its runs stay in the browser. */
export function historyMode(): HistoryMode {
  if (import.meta.env.MODE === 'demo') return 'browser';
  const content = document.querySelector('meta[name="boomerang-history"]')?.getAttribute('content');
  return content === 'browser' ? 'browser' : 'box';
}

/** The runs as last loaded, newest first. */
export function listResults(): Result[] {
  return runs;
}

export function getResult(id: string): Result | undefined {
  return runs.find((r) => r.id === id);
}

/**
 * Fetches the runs afresh and returns them. On a box, the first load also
 * sends the box this browser's own runs. When the box does not answer in
 * time, the runs already held are kept.
 */
export async function loadResults(): Promise<Result[]> {
  const at = version;
  if (historyMode() === 'browser') {
    runs = readLocal();
    return runs;
  }
  const signal = AbortSignal.timeout(LOAD_MS);
  try {
    await importLocal(signal);
    const response = await fetch('/runs', { signal, cache: 'no-store' });
    if (!response.ok) return runs;
    const body: unknown = await response.json();
    if (!Array.isArray(body) || at !== version) return runs;
    const stored = body as Result[];
    const missing = unsaved.filter((u) => !stored.some((r) => r.id === u.id));
    runs = [...missing, ...stored].sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    // The box is away; History shows what it already had.
  }
  return runs;
}

/** Keeps a finished run. A box that cannot take it does not fail the run: it stays in this page's list. */
export async function saveResult(result: Result): Promise<void> {
  version++;
  runs = [result, ...runs.filter((r) => r.id !== result.id)];
  if (historyMode() === 'browser') {
    writeLocal([result, ...readLocal().filter((r) => r.id !== result.id)]);
    return;
  }
  const status = await postRun(result).catch(() => 0);
  if (status < 200 || status >= 300) unsaved.push(result);
}

/** Empties History: the box's store, every browser's, or this browser's own runs. */
export async function clearResults(): Promise<void> {
  version++;
  runs = [];
  unsaved = [];
  if (historyMode() === 'browser') {
    writeLocal([]);
    return;
  }
  await fetch('/runs', { method: 'DELETE' }).catch(() => {});
}

/**
 * Sends this browser's own runs to the box once. Ids make a repeat harmless,
 * so a load cut short, or a store that failed, simply tries again next time;
 * a run the box refuses as malformed is left out for good.
 */
async function importLocal(signal: AbortSignal): Promise<void> {
  if (localStorage.getItem(IMPORTED_KEY)) return;
  const statuses = await Promise.all(readLocal().map((r) => postRun(r, signal)));
  if (statuses.some((status) => status !== 400 && (status < 200 || status >= 300))) return;
  localStorage.setItem(IMPORTED_KEY, '1');
}

/** Resolves to the box's status; rejects only when the box cannot be reached. */
async function postRun(result: Result, signal?: AbortSignal): Promise<number> {
  const response = await fetch('/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
    signal,
  });
  return response.status;
}

function readLocal(): Result[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Result[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(results: Result[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(results));
}
