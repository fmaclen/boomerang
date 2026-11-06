import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable, pipeline } from 'node:stream';
import type { Plugin } from 'vite';
import { parseResult } from '../src/lib/engine/stored.ts';
import type { Result } from '../src/lib/engine/types.ts';

// Stand-in for nginx in dev and preview: serves the download file, discards
// uploads, answers pings, and keeps the box's runs in memory, as the store in
// server/store.ts keeps them on disk.
//
// The middleware is registered directly in configureServer and
// configurePreviewServer, not from a returned function, so it runs before
// Vite's static and compression middlewares. Compression would otherwise
// strip Content-Length from the download and chunk it.

const CHUNK_BYTES = 4 * 1024 * 1024;
const CHUNKS = 8;
const DOWNLOAD_BYTES = CHUNK_BYTES * CHUNKS;
const RUN_BODY_LIMIT = 256 * 1024;

type Next = (err?: unknown) => void;

export function endpoints(): Plugin {
  const chunk = randomBytes(CHUNK_BYTES);
  // Newest first, one per id, as the store lists them.
  let runs: Result[] = [];

  function handle(req: IncomingMessage, res: ServerResponse, next: Next): void {
    const path = (req.url ?? '/').split('?')[0];
    const method = req.method ?? 'GET';

    if (path === '/ping' && method === 'GET') {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    if (path === '/downloading' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(DOWNLOAD_BYTES),
        'Cache-Control': 'no-store',
      });
      // One buffer sent eight times through a Readable so backpressure holds
      // when the client reads slowly or goes away mid-file.
      const body = Readable.from(repeat(chunk, CHUNKS), { objectMode: false });
      pipeline(body, res, () => {});
      return;
    }

    if (path === '/upload' && method === 'POST') {
      req.on('data', () => {});
      req.on('end', () => {
        res.writeHead(200, { 'Cache-Control': 'no-store' });
        res.end();
      });
      req.on('error', () => res.destroy());
      return;
    }

    if (path === '/runs' && method === 'POST') {
      readJson(req, (body) => {
        const run = parseResult(body);
        if (!run) {
          res.writeHead(400);
          res.end();
          return;
        }
        if (!runs.some((r) => r.id === run.id)) runs = [run, ...runs].sort((a, b) => b.startedAt - a.startedAt);
        res.writeHead(201, { 'Cache-Control': 'no-store' });
        res.end();
      });
      return;
    }

    if (path === '/runs' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(runs));
      return;
    }

    if (path === '/runs' && method === 'DELETE') {
      runs = [];
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    next();
  }

  return {
    name: 'boomerang-endpoints',
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

function* repeat(buffer: Buffer, times: number): Generator<Buffer> {
  for (let i = 0; i < times; i++) yield buffer;
}

/** Collects a small JSON body; hands `undefined` to `done` when it is too large or not JSON. */
function readJson(req: IncomingMessage, done: (body: unknown) => void): void {
  const parts: Buffer[] = [];
  let size = 0;
  req.on('data', (part: Buffer) => {
    size += part.length;
    if (size <= RUN_BODY_LIMIT) parts.push(part);
  });
  req.on('end', () => {
    if (size > RUN_BODY_LIMIT) return done(undefined);
    try {
      done(JSON.parse(Buffer.concat(parts).toString('utf8')));
    } catch {
      done(undefined);
    }
  });
  req.on('error', () => done(undefined));
}
