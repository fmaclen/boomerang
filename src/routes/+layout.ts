import { loadResults } from '../lib/engine';

// A single-page app: the page is built in the browser, and nginx serves the
// same shell for every address.
export const ssr = false;
export const prerender = false;

// History's runs are in before the first frame, so a visit straight to
// /history never shows the empty list first.
export const load = async () => {
  await loadResults();
};
