import { describe, expect, it } from 'vitest';
import {
  anchoredBounds,
  DEFAULT_COMPACT_MODE,
  directoryName,
  isValidSize,
  shouldCompact,
} from './compact.js';

describe('DEFAULT_COMPACT_MODE', () => {
  it('既定では畳まない', () => {
    expect(DEFAULT_COMPACT_MODE).toBe('off');
  });
});

describe('shouldCompact', () => {
  it('ON ならミニ表示にする', () => {
    expect(shouldCompact('on', false)).toBe(true);
  });

  it('OFF ならミニ表示にしない', () => {
    expect(shouldCompact('off', false)).toBe(false);
  });

  it('ミニ表示に描けない画面が出ている間は通常表示にする', () => {
    expect(shouldCompact('on', true)).toBe(false);
  });
});

describe('directoryName', () => {
  it.each([
    ['/Users/naoki/GitHub/app', 'app'],
    ['/Users/naoki/GitHub/app/', 'app'],
    ['/', '/'],
    ['', '(不明)'],
  ])('%s は %s', (cwd, name) => {
    expect(directoryName(cwd)).toBe(name);
  });
});

describe('isValidSize', () => {
  it('正の有限な幅・高さを受け付ける', () => {
    expect(isValidSize({ width: 120, height: 80 })).toBe(true);
  });

  it.each([
    null,
    undefined,
    'size',
    {},
    { width: 0, height: 80 },
    { width: 120, height: -1 },
    { width: Number.NaN, height: 80 },
    { width: 120, height: Number.POSITIVE_INFINITY },
    { width: '120', height: 80 },
  ])('%o は受け付けない', (value) => {
    expect(isValidSize(value)).toBe(false);
  });
});

describe('anchoredBounds', () => {
  const workArea = { x: 0, y: 25, width: 1440, height: 875 };
  const size = { width: 200, height: 100 };

  it('左上に置いたウィンドウは左上を固定する', () => {
    expect(anchoredBounds({ x: 10, y: 40, width: 360, height: 640 }, size, workArea)).toEqual({
      x: 10,
      y: 40,
      ...size,
    });
  });

  it('右上に置いたウィンドウは右端を固定する', () => {
    expect(anchoredBounds({ x: 1070, y: 40, width: 360, height: 640 }, size, workArea)).toEqual({
      x: 1230,
      y: 40,
      ...size,
    });
  });

  it('右下に置いたウィンドウは右端と下端を固定する', () => {
    expect(anchoredBounds({ x: 1070, y: 600, width: 360, height: 280 }, size, workArea)).toEqual({
      x: 1230,
      y: 780,
      ...size,
    });
  });

  it('広げたときに作業領域からはみ出す分は内側へ戻す', () => {
    const mini = { x: 20, y: 700, width: 200, height: 100 };
    expect(anchoredBounds(mini, { width: 360, height: 640 }, workArea)).toEqual({
      x: 20,
      y: 160,
      width: 360,
      height: 640,
    });
  });

  it('作業領域より大きいときは左端・上端を優先する', () => {
    const small = { x: 0, y: 0, width: 300, height: 200 };
    const large = { width: 400, height: 300 };
    expect(anchoredBounds({ x: 50, y: 50, width: 100, height: 100 }, large, small)).toEqual({
      x: 0,
      y: 0,
      ...large,
    });
  });
});
