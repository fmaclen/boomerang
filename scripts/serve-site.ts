// Serves site/build (bun run build:site) on SITE_PORT the way Cloudflare
// Pages will: files as they are, a folder's index.html, a page's .html, and
// the exact rewrites in site/static/_redirects. Bun reads .env itself.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'site/build';
const port = Number(process.env.SITE_PORT);
if (!Number.isInteger(port)) throw new Error('SITE_PORT missing from .env; run scripts/worktree-setup.py');

const rewrites = new Map(
  readFileSync(join(root, '_redirects'), 'utf8')
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(([from, , status]) => from?.startsWith('/') && status === '200')
    .map(([from, to]) => [from, to]),
);

function file(path: string): string | undefined {
  const at = join(root, path);
  for (const candidate of [at, join(at, 'index.html'), `${at}.html`])
    if (candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
}

Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    const found = file(rewrites.get(path) ?? path);
    return found ? new Response(Bun.file(found)) : new Response('Not found', { status: 404 });
  },
});
console.log(`site on http://127.0.0.1:${port}`);
