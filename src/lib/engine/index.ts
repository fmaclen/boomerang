// The engine behind the page. The page talks to the engine only through this
// module; its exports and types.ts are the contract.
import { deviceOf } from './device';
import type { Beat } from './measure';
import type { Mode, Progress, Result } from './types';
import type { FromWorker, ToWorker } from './worker';
// Inlined into the bundle, so starting a run fetches no script.
import MeasureWorker from './worker?worker&inline';

export type * from './types';
export { PAGE, clearRuns, getRun, historyMode, listRuns, saveRun } from './history';
export { formatBytes, formatMs, formatRate, type Formatted } from './format';
export { MIN_PHASE_SECONDS } from './measure';

/** The next run's worker, started ahead by prepareRun. */
let spare: Worker | undefined;

/**
 * Starts the next run's worker ahead of time, so that starting the run only
 * hands it a message. Spawning it on the press of Start takes time from the
 * frames that start the run; a page calls this while it is idle.
 */
export function prepareRun(): void {
  spare ??= new MeasureWorker();
}

export interface Run {
  /** Resolves with the measured run, device included, the moment it is measured; rejects on error or abort. Saving it is the page's call. */
  done: Promise<Result>;
  abort(): void;
}

/** Starts a test against the box that served the page, in a worker (see worker.ts). */
export function startRun(mode: Mode, onProgress: (progress: Progress) => void, before: Beat): Run {
  const worker: Worker = spare ?? new MeasureWorker();
  spare = undefined;
  const send = (m: ToWorker) => worker.postMessage(m);
  let stop: (error: Error) => void = () => {};
  const done = new Promise<Result>((resolve, reject) => {
    stop = reject;
    worker.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      if (m.type === 'progress') onProgress(m.progress);
      else if (m.type === 'before') void before(m.phase).then(() => send({ type: 'go' }));
      else if (m.type === 'done') resolve({ ...m.result, device: deviceOf() });
      else reject(new Error(m.message));
    };
    worker.onerror = (ev) => reject(new Error(ev.message || 'the measurement stopped'));
  });
  done.then(
    () => worker.terminate(),
    () => worker.terminate(),
  );
  send({ type: 'start', mode });
  return {
    done,
    abort: () => {
      send({ type: 'abort' });
      stop(new DOMException('Run aborted', 'AbortError'));
    },
  };
}
