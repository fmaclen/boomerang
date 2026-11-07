export type Mode = 'adaptive' | 'fixed';
export type HistoryMode = 'box' | 'browser';

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
  /** Mean absolute difference between consecutive probes. */
  jitterMs: number;
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
  device?: Device;
}

/** A run as History lists it: everything but the samples, which only a reopened run needs. */
export type Summary = Omit<Result, 'download' | 'upload'> & {
  download: Omit<Transfer, 'samples'>;
  upload: Omit<Transfer, 'samples'>;
};

/** What a running test reports as it goes. */
export interface Progress {
  phase: 'latency' | 'download' | 'upload';
  /** Rate right now, during download and upload; 0 otherwise. */
  mbps: number;
  /** Bytes moved so far in the run, both directions. */
  bytes: number;
  /** Idle round trips so far, in ms, while latency is measured. */
  pings?: number[];
  /** Filled in as each phase finishes. */
  idleMs?: number;
  jitterMs?: number;
  download?: Transfer;
  upload?: Transfer;
}
