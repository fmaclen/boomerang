// Serves the demo build (build-site/) the way Cloudflare Pages does, under
// BASE_PATH: a file as it is, a page's .html for its address, and the app's
// shell for any other address, so a run's own page reloads.
const root = 'build-site';
const base = process.env.BASE_PATH ?? '';
Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.SITE_PORT),
  async fetch(request) {
    let path = decodeURIComponent(new URL(request.url).pathname);
    if (!path.startsWith(base) || path.includes('..')) return new Response('Not found', { status: 404 });
    path = path.slice(base.length) || '/';
    if (path.endsWith('/')) path += 'index.html';
    for (const file of [path, `${path}.html`, '/index.html']) {
      const found = Bun.file(`${root}${file}`);
      if (await found.exists()) return new Response(found);
    }
    return new Response('Not found', { status: 404 });
  },
});
