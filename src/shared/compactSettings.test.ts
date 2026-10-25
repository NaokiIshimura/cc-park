import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPACT_LAYOUT,
  DEFAULT_COMPACT_MODE,
  DEFAULT_COMPACT_SETTINGS,
  nextCompactLayout,
  startupCompactSettings,
  toCompactSettings,
} from './compactSettings.js';

describe('DEFAULT_COMPACT_MODE', () => {
  it('既定では畳まない', () => {
    expect(DEFAULT_COMPACT_MODE).toBe('off');
  });
});

describe('DEFAULT_COMPACT_LAYOUT', () => {
  it('既定では縦 1 列に並べる', () => {
    expect(DEFAULT_COMPACT_LAYOUT).toBe('vertical');
  });
});

describe('nextCompactLayout', () => {
  it.each([
    ['vertical', 'horizontal'],
    ['horizontal', 'vertical'],
  ] as const)('%s の次は %s', (layout, next) => {
    expect(nextCompactLayout(layout)).toBe(next);
  });
});

describe('toCompactSettings', () => {
  it('解釈できる値はそのまま使う', () => {
    expect(toCompactSettings({ mode: 'on', layout: 'horizontal' })).toEqual({
      mode: 'on',
      layout: 'horizontal',
    });
  });

  it.each([undefined, null, 'on', 42])('オブジェクトでない %s は既定値にする', (value) => {
    expect(toCompactSettings(value)).toEqual(DEFAULT_COMPACT_SETTINGS);
  });

  it('解釈できない項目だけ既定値で埋める', () => {
    expect(toCompactSettings({ mode: 'yes', layout: 'horizontal' })).toEqual({
      mode: 'off',
      layout: 'horizontal',
    });
    expect(toCompactSettings({ mode: 'on', layout: 'grid' })).toEqual({
      mode: 'on',
      layout: 'vertical',
    });
  });
});

describe('startupCompactSettings', () => {
  it.each(['vertical', 'horizontal'] as const)(
    'ミニ表示のまま終了しても通常表示から始め、並び（%s）は引き継ぐ',
    (layout) => {
      expect(startupCompactSettings({ mode: 'on', layout })).toEqual({ mode: 'off', layout });
    },
  );

  it('通常表示で終了した場合もそのまま通常表示から始める', () => {
    expect(startupCompactSettings({ mode: 'off', layout: 'horizontal' })).toEqual({
      mode: 'off',
      layout: 'horizontal',
    });
  });
});
