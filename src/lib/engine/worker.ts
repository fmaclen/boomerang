// The measurement runs in a worker, off the page's thread. Reading five
// transfer streams chunk by chunk takes tens of milliseconds at a time at
// gigabit rates, which on the page's thread would come out of the scene's
// frames. startRun (index.ts) runs one worker per run and talks to it in
// these messages. The landing page's demo build reads a simulated link
// instead of the box (see simulate.ts); every other build leaves it out.

import { measure } from './measure';
import { simulatedNetwork } from './simulate';
import type { Mode, Progress, Result } from './types';

export type ToWorker = { type: 'start'; mode: Mode } | { type: 'go' } | { type: 'abort' };
export type FromWorker =
  | { type: 'progress'; progress: Progress }
  /** Waiting for the page's beat before a transfer; the page answers go. */
  | { type: 'before'; phase: 'download' | 'upload' }
  | { type: 'done'; result: Result }
  | { type: 'error'; message: string };

const scope = self as unknown as { postMessage(m: FromWorker): void; onmessage: ((ev: MessageEvent<ToWorker>) => void) | null };
const controller = new AbortController();
let go: (() => void) | null = null;

scope.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'abort') controller.abort();
  else if (m.type === 'go') {
    go?.();
    go = null;
  } else {
    const before = (phase: 'download' | 'upload') =>
      new Promise<void>((resolve) => {
        go = resolve;
        scope.postMessage({ type: 'before', phase });
      });
    const network = import.meta.env.MODE === 'demo' ? simulatedNetwork() : undefined;
    measure(m.mode, (progress) => scope.postMessage({ type: 'progress', progress }), controller.signal, { before }, network).then(
      (result) => scope.postMessage({ type: 'done', result }),
      (error: unknown) => scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
  }
};
