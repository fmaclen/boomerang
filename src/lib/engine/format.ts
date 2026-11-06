// How every page shows numbers: three significant digits, written out to two
// decimals below 10 and one below 100, so a zero reads 0.00 in a reading's
// own shape. Rates read in Mbps and Gbps only, sizes from MB up, latencies
// in ms.

/** A number ready to show: the digits and the unit apart, so a page can style them separately, and joined. */
export interface Formatted {
  value: string;
  unit: string;
  text: string;
}

/**
 * A rate given in Mbps: 0.51 Mbps, 9.54 Mbps, 49.9 Mbps, 1.24 Gbps, 1240 Gbps.
 * Zero reads 0.00 Mbps. Given a unit, it stays in that unit (960 Mbps in Gbps
 * reads 0.96 Gbps), for a live meter that holds a unit while the rate wavers
 * at the line.
 */
export function formatRate(mbps: number, unit?: string): Formatted {
  const giga = unit ? unit === 'Gbps' : mbps >= 999.5;
  return giga ? joined(sig3(mbps / 1000), 'Gbps') : joined(sig3(mbps), 'Mbps');
}

/** A size given in bytes, counted in megabytes and up: 0.00 MB, 24.6 MB, 1.62 GB. */
export function formatBytes(bytes: number): Formatted {
  const units = ['MB', 'GB', 'TB'];
  let n = bytes / 1e6;
  let i = 0;
  while (n >= 999.5 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return joined(sig3(n), units[i]);
}

/** A latency or jitter given in ms: 0.42 ms, 18.4 ms, 123 ms. */
export function formatMs(ms: number): Formatted {
  return joined(sig3(ms), 'ms');
}

/** Three significant digits: 0.00, 0.42, 9.54, 49.9, 512. Rounding is checked first, so 9.996 reads 10.0. */
function sig3(v: number): string {
  if (!Number.isFinite(v) || v < 0) v = 0;
  return v < 9.995 ? v.toFixed(2) : v < 99.95 ? v.toFixed(1) : v.toFixed(0);
}

function joined(value: string, unit: string): Formatted {
  return { value, unit, text: `${value} ${unit}` };
}
