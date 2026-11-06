import type { Handle } from '@sveltejs/kit/hooks';

// Lets a human run `HISTORY=browser bun run dev` (or build) without editing
// app.html. nginx flips the tag in Docker, and the suite flips it itself
// through page.route.
export const handle: Handle = ({ event, resolve }) => {
  const mode = process.env.HISTORY;
  if (mode !== 'box' && mode !== 'browser') return resolve(event);
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace(/(<meta name="boomerang-history" content=")[^"]*(")/, `$1${mode}$2`),
  });
};
