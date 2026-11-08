import { defineConfig, loadEnv } from 'vite';
import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

// PORT and PREVIEW_PORT come from .env, written by scripts/worktree-setup.py.
// Strict ports: a collision fails instead of drifting to another port.
function port(env: Record<string, string>, name: string): number {
  const value = Number(env[name]);
  if (!Number.isInteger(value)) throw new Error(`${name} missing from .env; run scripts/worktree-setup.py`);
  return value;
}

// Two builds share this config, by mode:
// - the default is the box: the page and the endpoints it measures against,
//   one server in build/, run with Bun (`bun run start`);
// - `demo` is the public site, the same app reading a simulated link, as
//   static files in build-site/ for Cloudflare Pages (`bun run build:site`).
function kit(mode: string) {
  if (mode === 'demo')
    return {
      // The box's endpoints are left out: the demo never calls them.
      adapter: adapterStatic({ pages: 'build-site', strict: false }),
      outDir: '.svelte-kit-demo',
      files: { appTemplate: 'src/demo.html' },
      // Served from BASE_PATH (the site's root by default). Paths are absolute,
      // since a static host answers every run's address with the same shell.
      paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}`, relative: false },
      output: { bundleStrategy: 'single' as const },
    };
  return {
    // An upload posts 8 MiB at a time: the server takes bodies up to BODY_SIZE_LIMIT (see `bun run start`).
    adapter: adapterNode({ precompress: true }),
    // A box is reached at whatever address its owner gives it, over plain
    // http as often as not, which no build can know; so no request is turned
    // away for its origin. The one route that keeps anything (/runs) takes
    // only JSON, which a page elsewhere cannot send without the box's say-so.
    csrf: { trustedOrigins: ['*'] },
    paths: { relative: false },
    output: { bundleStrategy: 'single' as const },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // SvelteKit's prerender step loads this config again in another process,
  // which learns the mode only from MODE.
  process.env.MODE = mode;
  // A build needs no ports, so the Docker image builds without an .env.
  const serving = command === 'serve' || process.argv.includes('preview');
  return {
    plugins: [tailwindcss(), sveltekit(kit(mode))],
    server: { host: '127.0.0.1', port: serving ? port(env, 'PORT') : undefined, strictPort: true, allowedHosts: ['.ts.net'] },
    preview: { host: '127.0.0.1', port: serving ? port(env, 'PREVIEW_PORT') : undefined, strictPort: true, allowedHosts: ['.ts.net'] },
  };
});
