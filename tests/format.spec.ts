import { expect, test } from '@playwright/test';
import { formatBytes, formatMs, formatRate } from '../src/lib/engine/format';
import { parseQuantity } from './helpers';

const rate = (mbps: number) => formatRate(mbps).text;
const size = (bytes: number) => formatBytes(bytes).text;

test('rates keep three significant digits in Mbps, then Gbps', () => {
  expect(rate(9.54)).toBe('9.54 Mbps');
  expect(rate(49.94)).toBe('49.9 Mbps');
  expect(rate(512)).toBe('512 Mbps');
  expect(rate(1240)).toBe('1.24 Gbps');
  expect(rate(29929.1)).toBe('29.9 Gbps');
});

test('a rate that rounds up to the next power of ten takes its digits or its unit', () => {
  expect(rate(9.996)).toBe('10.0 Mbps');
  expect(rate(99.96)).toBe('100 Mbps');
  expect(rate(999.4)).toBe('999 Mbps');
  expect(rate(999.5)).toBe('1.00 Gbps');
});

test('the slowest and fastest rates stay in Mbps and Gbps, and zero keeps a reading shape', () => {
  expect(rate(0)).toBe('0.00 Mbps');
  expect(rate(0.512)).toBe('0.51 Mbps');
  expect(rate(1_240_000)).toBe('1240 Gbps');
});

test('a live meter holds the unit it is given', () => {
  expect(formatRate(960, 'Gbps').text).toBe('0.96 Gbps');
  expect(formatRate(1004, 'Mbps').text).toBe('1004 Mbps');
});

test('sizes count from megabytes up', () => {
  expect(size(0)).toBe('0.00 MB');
  expect(size(812_000)).toBe('0.81 MB');
  expect(size(24.6e6)).toBe('24.6 MB');
  expect(size(999.5e6)).toBe('1.00 GB');
  expect(size(1.62e9)).toBe('1.62 GB');
  expect(size(24e12)).toBe('24.0 TB');
});

test('latency keeps three significant digits in ms', () => {
  expect(formatMs(0.42).text).toBe('0.42 ms');
  expect(formatMs(18.44).text).toBe('18.4 ms');
  expect(formatMs(123.4).text).toBe('123 ms');
  expect(formatMs(0).text).toBe('0.00 ms');
});

test('the value and unit come apart as well as joined', () => {
  expect(formatRate(1240)).toEqual({ value: '1.24', unit: 'Gbps', text: '1.24 Gbps' });
});

test('the suite reads every formatted unit back in Mbps or bytes', () => {
  expect(parseQuantity(rate(29929.1))).toBeCloseTo(29900);
  expect(parseQuantity(rate(0.512))).toBeCloseTo(0.51);
  expect(parseQuantity(size(1.62e9))).toBe(1.62e9);
  expect(parseQuantity('DOWNLOAD 49.9 MBPS')).toBe(49.9);
  expect(parseQuantity(formatMs(18.44).text)).toBe(18.4);
});
