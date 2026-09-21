import { describe, expect, it } from 'vitest';
import {
  formatTokenBar,
  formatTokenCounts,
  formatTokenPercent,
  toFilledSegments,
  tokenUsageColor,
  toPercent,
  TOKEN_BAR_SEGMENTS,
  TOKEN_TEXT_WIDTH,
} from './formatTokenUsage.js';

describe('toPercent', () => {
  it('比率をパーセントの整数へ直す', () => {
    expect(toPercent(0.455)).toBe(46);
  });

  it('0〜1 の外側はクランプする', () => {
    expect(toPercent(-1)).toBe(0);
    expect(toPercent(2)).toBe(100);
  });
});

describe('toFilledSegments', () => {
  it('比率に応じた数だけ塗る', () => {
    expect(toFilledSegments(0.5)).toBe(TOKEN_BAR_SEGMENTS / 2);
  });

  it('0% はまったく塗らない', () => {
    expect(toFilledSegments(0)).toBe(0);
  });

  it('0% 以外は必ず 1 つ以上塗る', () => {
    expect(toFilledSegments(0.001)).toBe(1);
  });

  it('100% はすべて塗る', () => {
    expect(toFilledSegments(1)).toBe(TOKEN_BAR_SEGMENTS);
  });
});

describe('formatTokenBar', () => {
  it('セグメント数ぶんの文字幅になる', () => {
    expect(formatTokenBar(0.45)).toHaveLength(TOKEN_BAR_SEGMENTS);
  });

  it('Block Elements だけで構成する', () => {
    expect(formatTokenBar(0.45)).toBe('████░░░░');
  });

  it('0% は空のバーになる', () => {
    expect(formatTokenBar(0)).toBe('░░░░░░░░');
  });
});

describe('formatTokenPercent', () => {
  it('3 桁へ右寄せして桁を揃える', () => {
    expect(formatTokenPercent(0.07)).toBe('ctx   7%');
    expect(formatTokenPercent(0.45)).toBe('ctx  45%');
    expect(formatTokenPercent(1)).toBe('ctx 100%');
  });

  it('どの値でも表示幅が変わらない', () => {
    for (const ratio of [0, 0.07, 0.5, 1]) {
      expect(formatTokenPercent(ratio)).toHaveLength(TOKEN_TEXT_WIDTH - TOKEN_BAR_SEGMENTS - 1);
    }
  });
});

describe('tokenUsageColor', () => {
  it('余裕があるうちは目立たせない', () => {
    expect(tokenUsageColor(0.69)).toBe('gray');
  });

  it('70% から警告色にする', () => {
    expect(tokenUsageColor(0.7)).toBe('yellow');
    expect(tokenUsageColor(0.89)).toBe('yellow');
  });

  it('90% から危険色にする', () => {
    expect(tokenUsageColor(0.9)).toBe('red');
    expect(tokenUsageColor(1)).toBe('red');
  });
});

describe('formatTokenCounts', () => {
  it('実数値を k 単位で表す', () => {
    expect(formatTokenCounts({ used: 66_701, limit: 200_000, ratio: 0.33 })).toBe('67k / 200k');
  });
});
