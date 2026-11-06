import { defineConfig, loadEnv } from 'vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { endpoints } from './server/endpoints.ts';

// PORT and PREVIEW_PORT come from .env, written by scripts/worktree-setup.py.
// Strict ports: a collision fails instead of drifting to another port.
function port(env: Record<string, string>, name: string): number {
  const value = Number(env[name]);
  if (!Number.isInteger(value)) throw new Error(`${name} missing from .env; run scripts/worktree-setup.py`);
  return value;
}

// Three builds share this config, by mode:
// - the default is the app a box serves, into build/;
// - `site` is the landing page at boomerang.fernando.is (site/routes), into site/build/;
// - `demo` is the app again, under /demo/ of that site, with simulated
//   readings in place of the measurement (see src/lib/engine/worker.ts).
// Build site first: each build clears its own output folder, and the demo's
// lives inside the site's. `bun run build:site` runs both in that order.
function kit(mode: string) {
  if (mode === 'site')
    return {
      adapter: adapter({ pages: 'site/build' }),
      outDir: '.svelte-kit-site',
      files: { routes: 'site/routes', appTemplate: 'site/app.html', assets: 'site/static' },
      // The demo the page frames is the next build's, so the crawler finds nothing at /demo/ yet.
      prerender: {
        handleHttpError: ({ path, message }: { path: string; message: string }) => {
          if (!path.startsWith('/demo/')) throw new Error(message);
        },
      },
    };
  if (mode === 'demo')
    return {
      adapter: adapter({ pages: 'site/build/demo', fallback: 'index.html' }),
      outDir: '.svelte-kit-demo',
      paths: { base: '/demo' as const },
      output: { bundleStrategy: 'single' as const },
    };
  // A single-page app: nothing is prerendered, and build/index.html is the
  // shell nginx serves for every page address.
  return { adapter: adapter({ fallback: 'index.html' }), output: { bundleStrategy: 'single' as const } };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // SvelteKit's prerender step loads this config again in another process,
  // which learns the mode only from MODE.
  process.env.MODE = mode;
  // A build needs no ports, so the Docker image builds without an .env.
  const serving = command === 'serve' || process.argv.includes('preview');
  return {
    plugins: [
      // First, so the test endpoints answer before SvelteKit's own middleware.
      // The site has no box behind it, so it answers none of them.
      mode === 'site' || mode === 'demo' ? [] : endpoints(),
      tailwindcss(),
      sveltekit(kit(mode)),
    ],
    server: { host: '127.0.0.1', port: serving ? port(env, 'PORT') : undefined, strictPort: true },
    preview: { host: '127.0.0.1', port: serving ? port(env, 'PREVIEW_PORT') : undefined, strictPort: true },
  };
});
