export type Mode = 'adaptive' | 'fixed';
export type HistoryMode = 'box' | 'browser';
export type Phase = 'latency' | 'download' | 'upload' | 'done' | 'error';

/**
 * One point of the rate over time: `t` seconds into the phase and the rolling
 * one-second rate the meter read then, ten a second. Runs saved before that
 * kept one a second, each the rate over the second it closed.
 */
export interface Sample {
  t: number;
  mbps: number;
}

/** One direction of a finished run. */
export interface Transfer {
  /** Reported rate in megabits per second (1e6 bits). */
  mbps: number;
  /** Bytes moved during the phase. */
  bytes: number;
  /** Phase length in seconds. */
  seconds: number;
  /** Rate over time, ten samples a second. */
  samples: Sample[];
}

export interface Latency {
  /** Idle latency before any transfer, in milliseconds (median of the probes). */
  idleMs: number;
  /** Mean absolute difference between consecutive idle probes. */
  jitterMs: number;
  /** Median latency while the download ran. */
  downloadMs: number;
  /** Median latency while the upload ran. */
  uploadMs: number;
}

/** What a run was made on, read from the browser (see device.ts). Empty strings where it could not tell. */
export interface Device {
  /** iPhone, iPad, macOS, Windows, Android, ChromeOS or Linux. */
  os: string;
  form: 'Desktop' | 'Mobile' | 'Tablet';
  /** Safari, Chrome, Brave, Edge, Firefox, Opera or Samsung Internet. */
  browser: string;
}

export interface Result {
  id: string;
  /** Epoch milliseconds when the run started. */
  startedAt: number;
  mode: Mode;
  download: Transfer;
  upload: Transfer;
  latency: Latency;
  /** Set when the run is saved; runs saved before it was recorded have none. Kept in the browser only. */
  device?: Device;
}

/** What a running test reports to subscribers. */
export interface Progress {
  phase: Phase;
  mode: Mode;
  /** Seconds since the run started. */
  elapsed: number;
  /** Rate right now, during download and upload; 0 otherwise. */
  mbps: number;
  /** Bytes moved so far in the run, both directions. */
  bytes: number;
  /** Samples of the phase in progress. */
  samples: Sample[];
  /** Idle round trips so far, in ms, while latency is measured. */
  pings?: number[];
  /** Median latency so far while the link is loaded, during download and upload. */
  loadedMs?: number;
  /** Filled in as each phase finishes. */
  idleMs?: number;
  jitterMs?: number;
  download?: Transfer;
  upload?: Transfer;
  /** Set when `phase` is 'done'. */
  result?: Result;
  /** Set when `phase` is 'error'. */
  error?: string;
}

export interface RunOptions {
  /**
   * Awaited before each transfer starts, so a page can give the phase before
   * it a beat on screen. The transfer's own clock starts once it resolves;
   * an abort still ends the run while it waits.
   */
  before?: (phase: 'download' | 'upload') => Promise<void>;
}

export interface Run {
  /** Calls `fn` now and on every change. Svelte-store compatible, so `$run` works. */
  subscribe(fn: (progress: Progress) => void): () => void;
  /** Resolves with the saved result; rejects on error or abort. */
  done: Promise<Result>;
  abort(): void;
}
