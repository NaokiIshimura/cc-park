import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../shared/characters.js';
import { INK_COLOR_VARIABLES, inkColor } from './colors.js';

describe('inkColor', () => {
  it('対応表にある色名を CSS 変数へ変換する', () => {
    expect(inkColor('cyan')).toBe('var(--ink-cyan)');
  });

  it('未知の色名は既定色へフォールバックする', () => {
    expect(inkColor('chartreuse')).toBe('var(--ink-default)');
  });
});

describe('INK_COLOR_VARIABLES', () => {
  it('キャラクター定義で使う色をすべて網羅している', () => {
    for (const appearance of Object.values(CHARACTERS)) {
      expect(INK_COLOR_VARIABLES[appearance.color]).toBeDefined();
    }
  });

  it('行の装飾で使う色も網羅している', () => {
    for (const name of ['magenta', 'blueBright', 'white']) {
      expect(INK_COLOR_VARIABLES[name]).toBeDefined();
    }
  });
});
