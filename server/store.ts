import { Database } from 'bun:sqlite';
import { parseResult } from '../src/lib/engine/stored.ts';

// The box's run store, behind nginx on loopback: the same /runs that
// server/endpoints.ts serves in dev, kept in SQLite. Each run is stored as
// the JSON parseResult rebuilt from the body, keyed by its id, so a repeated
// post is a no-op and nothing outside a Result can reach the database.

const db = new Database(process.env.RUNS_DB ?? '/data/runs.sqlite', { create: true });
db.run('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, startedAt REAL NOT NULL, run TEXT NOT NULL)');

const insert = db.prepare('INSERT OR IGNORE INTO runs (id, startedAt, run) VALUES (?, ?, ?)');
const newest = db.prepare<{ run: string }, []>('SELECT run FROM runs ORDER BY startedAt DESC');
const clear = db.prepare('DELETE FROM runs');

const headers = { 'Cache-Control': 'no-store' };

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 3100,
  maxRequestBodySize: 256 * 1024,
  async fetch(request) {
    if (new URL(request.url).pathname !== '/runs') return new Response(null, { status: 404 });

    if (request.method === 'GET') {
      // The rows are already JSON; join them rather than parse and re-encode.
      const body = `[${newest.all().map((row) => row.run).join(',')}]`;
      return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST') {
      const run = parseResult(await request.json().catch(() => null));
      if (!run) return new Response(null, { status: 400 });
      insert.run(run.id, run.startedAt, JSON.stringify(run));
      return new Response(null, { status: 201, headers });
    }

    if (request.method === 'DELETE') {
      clear.run();
      return new Response(null, { status: 204, headers });
    }

    return new Response(null, { status: 405 });
  },
});

console.log(`run store on ${server.url}, database ${db.filename}`);
