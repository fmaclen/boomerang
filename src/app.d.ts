// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
  namespace App {
    /** The history entry's own state: where History is in the browser's history (see ui/history.ts). */
    interface PageState {
      /** How many of this page's entries sit above home; 0 when the visit began at /history. */
      depth?: number;
      /** The id of the run reopened from History. */
      run?: string;
    }
  }
}

export {};
