// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PALETTES, THEME_VARIABLES } from '../../shared/themes.js';
import { applyAppearance, systemPrefersDark } from './appearance.js';

const root = (): HTMLElement => document.createElement('html');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('applyAppearance', () => {
  it('プリセットは CSS 変数をすべてインラインで上書きする', () => {
    const element = root();
    applyAppearance(element, { theme: 'forest', accent: null, frame: true });

    expect(element.dataset['theme']).toBe('forest');
    for (const name of THEME_VARIABLES) {
      expect(element.style.getPropertyValue(name)).toBe(PALETTES.forest.variables[name]);
    }
  });

  it('system / light / dark は styles.css の既定値に任せ、上書きを消す', () => {
    const element = root();
    applyAppearance(element, { theme: 'navy', accent: null, frame: true });

    for (const theme of ['system', 'light', 'dark'] as const) {
      applyAppearance(element, { theme, accent: null, frame: true });
      expect(element.dataset['theme']).toBe(theme);
      for (const name of THEME_VARIABLES) {
        expect(element.style.getPropertyValue(name)).toBe('');
      }
    }
  });

  it('強調色を指定すれば --accent を上書きし、外せば既定へ戻す', () => {
    const element = root();
    applyAppearance(element, { theme: 'dark', accent: '#f59e0b', frame: true });
    expect(element.style.getPropertyValue('--accent')).toBe('#f59e0b');

    applyAppearance(element, { theme: 'dark', accent: null, frame: true });
    expect(element.style.getPropertyValue('--accent')).toBe('');
  });

  it('枠線の有無を data-frame に反映する', () => {
    const element = root();
    applyAppearance(element, { theme: 'dark', accent: null, frame: false });
    expect(element.dataset['frame']).toBe('off');

    applyAppearance(element, { theme: 'dark', accent: null, frame: true });
    expect(element.dataset['frame']).toBe('on');
  });
});

describe('systemPrefersDark', () => {
  it('matchMedia の判定を返す', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', matchMedia);
    expect(systemPrefersDark()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  });

  it('matchMedia が無ければライトとみなす', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(systemPrefersDark()).toBe(false);
  });
});
