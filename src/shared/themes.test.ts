import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  DEFAULT_APPEARANCE,
  isAccentColor,
  isThemeId,
  PALETTES,
  resolveAppearance,
  resolvePalette,
  THEME_IDS,
  THEME_LABELS,
  THEME_VARIABLES,
  themeSourceOf,
  toAppearance,
} from './themes.js';

const palettes = Object.values(PALETTES);

/** styles.css の 1 ブロックから `--name: value;` を取り出す。 */
const readVariables = (block: string): Record<string, string> =>
  Object.fromEntries(
    [...block.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{3,6});/gi)].map(([, name, value]) => [
      name,
      value,
    ]),
  );

describe('PALETTES', () => {
  it('すべての配色が必要な CSS 変数を #rrggbb で持つ', () => {
    for (const palette of palettes) {
      for (const name of THEME_VARIABLES) {
        expect(palette.variables[name], `${palette.id} ${name}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('キーと id が一致する', () => {
    for (const [key, palette] of Object.entries(PALETTES)) {
      expect(palette.id).toBe(key);
    }
  });

  it('light / dark は styles.css の既定値と一致する', () => {
    const css = readFileSync(new URL('../gui/renderer/styles.css', import.meta.url), 'utf8');
    const [lightBlock = '', rest = ''] = css.split('@media (prefers-color-scheme: dark)');
    const darkBlock = rest.slice(0, rest.indexOf('\n}'));

    for (const [palette, block] of [
      [PALETTES.light, lightBlock],
      [PALETTES.dark, darkBlock],
    ] as const) {
      const variables = readVariables(block);
      for (const name of THEME_VARIABLES) {
        expect(variables[name], `${palette.id} ${name}`).toBe(palette.variables[name]);
      }
    }
  });

  it('本文の文字色は背景に対して 4.5:1 以上のコントラストがある', () => {
    for (const { id, variables } of palettes) {
      for (const text of ['--fg', '--fg-muted'] as const) {
        for (const background of ['--bg', '--surface'] as const) {
          expect(
            contrastRatio(variables[text], variables[background]),
            `${id} ${text} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('キャラクターの色は選択行も含めたどの背景でも 3:1 以上のコントラストがある', () => {
    // AA はブロック文字の図形なので、WCAG の非テキスト要素の基準（3:1）を当てる
    const colors = THEME_VARIABLES.filter((name) => name.startsWith('--ink-') || name.startsWith('--fg'));
    for (const { id, variables } of palettes) {
      for (const color of colors) {
        for (const background of ['--bg', '--surface', '--surface-selected'] as const) {
          expect(
            contrastRatio(variables[color], variables[background]),
            `${id} ${color} on ${background}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('枠線は黒いターミナルの上でも 3:1 以上のコントラストがある', () => {
    for (const { id, variables } of palettes) {
      expect(contrastRatio(variables['--frame'], '#000000'), id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('THEME_LABELS', () => {
  it('すべてのテーマに表示名がある', () => {
    for (const theme of THEME_IDS) {
      expect(THEME_LABELS[theme]).not.toBe('');
    }
  });
});

describe('isThemeId', () => {
  it('定義済みの名前だけ受け付ける', () => {
    expect(isThemeId('navy')).toBe(true);
    expect(isThemeId('system')).toBe(true);
    expect(isThemeId('rainbow')).toBe(false);
    expect(isThemeId(1)).toBe(false);
  });
});

describe('isAccentColor', () => {
  it('#rgb / #rrggbb だけ受け付ける', () => {
    expect(isAccentColor('#fa0')).toBe(true);
    expect(isAccentColor('#F59E0B')).toBe(true);
    expect(isAccentColor('f59e0b')).toBe(false);
    expect(isAccentColor('#f59e0b80')).toBe(false);
    expect(isAccentColor('orange')).toBe(false);
    expect(isAccentColor(null)).toBe(false);
  });
});

describe('toAppearance', () => {
  it('正しい値はそのまま使う', () => {
    expect(toAppearance({ theme: 'sepia', accent: '#123456' })).toEqual({
      theme: 'sepia',
      accent: '#123456',
    });
  });

  it('解釈できない項目は既定値で埋める', () => {
    expect(toAppearance({ theme: 'rainbow', accent: 'red' })).toEqual(DEFAULT_APPEARANCE);
  });

  it('オブジェクト以外は既定値にする', () => {
    expect(toAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(toAppearance('navy')).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('resolvePalette', () => {
  it('system は OS の外観で light / dark に解決する', () => {
    expect(resolvePalette('system', true)).toBe(PALETTES.dark);
    expect(resolvePalette('system', false)).toBe(PALETTES.light);
  });

  it('それ以外は OS の外観に関わらずその配色を返す', () => {
    expect(resolvePalette('navy', false)).toBe(PALETTES.navy);
    expect(resolvePalette('light', true)).toBe(PALETTES.light);
  });
});

describe('themeSourceOf', () => {
  it('system は OS に任せる', () => {
    expect(themeSourceOf('system')).toBe('system');
  });

  it('プリセットは配色の明暗に合わせる', () => {
    expect(themeSourceOf('navy')).toBe('dark');
    expect(themeSourceOf('sepia')).toBe('light');
  });
});

describe('resolveAppearance', () => {
  const saved = { theme: 'forest', accent: '#123456' } as const;

  it('CLI の指定が無ければ保存済みの値を使う', () => {
    expect(resolveAppearance({ theme: null, accent: null }, saved)).toEqual(saved);
  });

  it('CLI で明示した値を優先する', () => {
    expect(resolveAppearance({ theme: 'navy', accent: '#f59e0b' }, saved)).toEqual({
      theme: 'navy',
      accent: '#f59e0b',
    });
  });

  it('項目ごとに優先順位を判断する', () => {
    expect(resolveAppearance({ theme: 'navy', accent: null }, saved)).toEqual({
      theme: 'navy',
      accent: '#123456',
    });
  });
});

describe('contrastRatio', () => {
  it('白と黒は 21:1、同じ色どうしは 1:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21);
    expect(contrastRatio('#808080', '#808080')).toBe(1);
  });
});
