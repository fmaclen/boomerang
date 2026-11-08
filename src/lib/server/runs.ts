import { Database } from 'bun:sqlite';
import { parseResult } from '../engine/stored';
import type { HistoryMode } from '../engine/types';

// The box's run store, in SQLite. Each run is kept as the JSON parseResult
// rebuilt from its post, keyed by its id, so a repeated post is a no-op and
// nothing outside a Result can reach the database. HISTORY=browser leaves
// runs to each browser: the store never opens, and /runs only says so, which
// is how the page learns where runs are kept.

/** A run's post is a few tens of KB; a Long run's samples stay well under this. */
const BODY_LIMIT = 256 * 1024;
const PAGE = 10;
const headers = { 'Cache-Control': 'no-store' };

const historyMode = (): HistoryMode => (process.env.HISTORY === 'browser' ? 'browser' : 'box');

let db: Database | undefined;
function store(): Database {
  if (!db) {
    db = new Database(process.env.RUNS_DB ?? 'runs.sqlite', { create: true });
    db.run('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, startedAt REAL NOT NULL, run TEXT NOT NULL)');
    // So a page of History reads ten rows, not every stored run.
    db.run('CREATE INDEX IF NOT EXISTS runs_startedAt ON runs (startedAt)');
  }
  return db;
}

/** Answers for /runs and /runs/[id]; null when runs are kept in browsers. */
export function runs(): typeof handlers | null {
  return historyMode() === 'box' ? handlers : null;
}

const handlers = {
  /** A page of runs, newest first, without the samples only a reopened run needs: { runs, more }. */
  list(from: number): Response {
    const rows = store()
      .query<{ run: string }, [number, number]>(
        "SELECT json_remove(run, '$.download.samples', '$.upload.samples') AS run FROM runs ORDER BY startedAt DESC LIMIT ? OFFSET ?",
      )
      .all(PAGE + 1, Math.min(2 ** 31, Math.max(0, Math.floor(from) || 0)));
    const more = rows.length > PAGE;
    // The rows are already JSON; join them rather than parse and re-encode.
    const body = `{"runs":[${rows.slice(0, PAGE).map((row) => row.run).join(',')}],"more":${more}}`;
    return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json' } });
  },

  one(id: string): Response {
    const row = store().query<{ run: string }, [string]>('SELECT run FROM runs WHERE id = ?').get(id);
    if (!row) return new Response(null, { status: 404, headers });
    return new Response(row.run, { headers: { ...headers, 'Content-Type': 'application/json' } });
  },

  async save(request: Request): Promise<Response> {
    // JSON only, so no page elsewhere can post a run without the box's say-so (see vite.config.ts).
    if (!request.headers.get('content-type')?.startsWith('application/json')) return new Response(null, { status: 415 });
    const text = await bounded(request);
    if (text === null) return new Response(null, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return new Response(null, { status: 400 });
    }
    const run = parseResult(body);
    if (!run) return new Response(null, { status: 400 });
    store().query('INSERT OR IGNORE INTO runs (id, startedAt, run) VALUES (?, ?, ?)').run(run.id, run.startedAt, JSON.stringify(run));
    return new Response(null, { status: 201, headers });
  },

  clear(): Response {
    store().run('DELETE FROM runs');
    return new Response(null, { status: 204, headers });
  },
};

/** The body as text, read only as far as BODY_LIMIT bytes; null, and the rest left unread, past it. */
async function bounded(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length')) > BODY_LIMIT) return null;
  const reader = request.body?.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader?.read();
    if (!part || part.done) break;
    size += part.value.byteLength;
    if (size > BODY_LIMIT) {
      await reader!.cancel();
      return null;
    }
    parts.push(part.value);
  }
  return Buffer.concat(parts).toString('utf8');
}
