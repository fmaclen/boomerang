// The engine behind the page. The page (src/routes and the rest of src/lib)
// talks to the engine only through this module; its exports and types.ts are the contract.
import { deviceOf } from './device';
import { saveResult } from './history';
import { seedHistory } from './simulate';
import type { Mode, Progress, Result, Run, RunOptions } from './types';
import type { FromWorker, ToWorker } from './worker';
// Inlined into the bundle, so starting a run fetches no script.
import MeasureWorker from './worker?worker&inline';

export type * from './types';
export { clearResults, getResult, historyMode, listResults, loadResults } from './history';
export { formatBytes, formatMs, formatRate, type Formatted } from './format';
export { MIN_PHASE_SECONDS } from './measure';

// The landing page's demo opens with a few past runs in History.
if (import.meta.env.MODE === 'demo') seedHistory();

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

/**
 * Starts a test against the box that served the page. The measurement runs
 * in a worker (see worker.ts); the finished result is saved to history, with
 * the device it ran on, before `done` resolves: on a box, once the box has it
 * or has failed to take it, so another browser can list it as soon as it shows.
 */
export function startRun(mode: Mode, options: RunOptions = {}): Run {
  const subscribers = new Set<(progress: Progress) => void>();
  let current: Progress = { phase: 'latency', mode, elapsed: 0, mbps: 0, bytes: 0, samples: [] };
  const notify = (progress: Progress) => {
    current = progress;
    for (const fn of subscribers) fn(progress);
  };
  let aborted = false;
  let stop: (error: Error) => void = () => {};
  const worker: Worker = spare ?? new MeasureWorker();
  spare = undefined;
  const send = (m: ToWorker) => worker.postMessage(m);

  const measured = new Promise<Result>((resolve, reject) => {
    stop = reject;
    worker.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      if (m.type === 'progress') notify(m.progress);
      else if (m.type === 'before') void Promise.resolve(options.before?.(m.phase)).then(() => send({ type: 'go' }));
      else if (m.type === 'done') resolve(m.result);
      else reject(new Error(m.message));
    };
    worker.onerror = (ev) => reject(new Error(ev.message || 'the measurement stopped'));
  });
  send({ type: 'start', mode });

  const done = (async () => {
    try {
      const result: Result = { ...(await measured), device: deviceOf() };
      await saveResult(result);
      notify({ ...current, phase: 'done', result });
      return result;
    } catch (error) {
      if (!aborted) notify({ ...current, phase: 'error', error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      worker.terminate();
    }
  })();

  return {
    subscribe(fn) {
      fn(current);
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    done,
    abort: () => {
      if (aborted) return;
      aborted = true;
      send({ type: 'abort' });
      stop(new DOMException('Run aborted', 'AbortError'));
    },
  };
}
