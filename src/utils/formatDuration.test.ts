import { describe, expect, it } from 'vitest';
import { formatDuration } from './formatDuration.js';

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [999, '0s'],
    [1000, '1s'],
    [59_000, '59s'],
    [60_000, '1m'],
    [192_000, '3m12s'],
    [600_000, '10m'],
    [645_000, '10m'],
    [1_080_000, '18m'],
    [3_600_000, '1h0m'],
    [7_500_000, '2h5m'],
    [86_400_000, '1d0h'],
    [273_600_000, '3d4h'],
  ])('%d ms を %s に整形する', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('負値は - を返す', () => {
    expect(formatDuration(-1)).toBe('-');
  });

  it('数値でない場合は - を返す', () => {
    expect(formatDuration(Number.NaN)).toBe('-');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('-');
  });
});
