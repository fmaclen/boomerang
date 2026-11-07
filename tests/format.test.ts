import { expect, test } from 'bun:test';
import { formatBytes, formatMs, formatRate } from '../src/lib/engine/format';

const rate = (mbps: number) => formatRate(mbps).text;

test('rates keep three significant digits, in Mbps and then Gbps', () => {
  expect([0, 0.512, 9.54, 9.996, 49.94, 99.96, 999.4, 999.5, 1240, 1_240_000].map(rate)).toEqual([
    '0.00 Mbps',
    '0.51 Mbps',
    '9.54 Mbps',
    '10.0 Mbps',
    '49.9 Mbps',
    '100 Mbps',
    '999 Mbps',
    '1.00 Gbps',
    '1.24 Gbps',
    '1240 Gbps',
  ]);
});

test('a live meter holds the unit it is given', () => {
  expect(formatRate(960, 'Gbps').text).toBe('0.96 Gbps');
  expect(formatRate(1004, 'Mbps').text).toBe('1004 Mbps');
  expect(formatRate(1240)).toEqual({ value: '1.24', unit: 'Gbps', text: '1.24 Gbps' });
});

test('sizes count from megabytes up, and latency in ms', () => {
  expect([0, 812_000, 24.6e6, 999.5e6, 1.62e9, 24e12].map((b) => formatBytes(b).text)).toEqual([
    '0.00 MB',
    '0.81 MB',
    '24.6 MB',
    '1.00 GB',
    '1.62 GB',
    '24.0 TB',
  ]);
  expect([0, 0.42, 18.44, 123.4].map((ms) => formatMs(ms).text)).toEqual(['0.00 ms', '0.42 ms', '18.4 ms', '123 ms']);
});
