import { PALETTES, THEME_VARIABLES, type Appearance } from '../../shared/themes.js';

/**
 * 見た目の設定を DOM（`<html>` 要素）へ反映する。
 *
 * - `system` / `light` / `dark`: styles.css の既定値に任せる。明暗は main が
 *   `nativeTheme.themeSource` で切り替え、`prefers-color-scheme` が追従する
 * - それ以外のプリセット: CSS 変数をインラインで上書きする（styles.css より優先される）
 * - 強調色: 指定があれば `--accent` を上書きし、無ければ配色ごとの既定（`--ink-cyan`）に戻す
 */
export const applyAppearance = (root: HTMLElement, appearance: Appearance): void => {
  const { theme, accent } = appearance;
  root.dataset['theme'] = theme;

  const overrides =
    theme === 'system' || theme === 'light' || theme === 'dark'
      ? null
      : PALETTES[theme].variables;

  for (const name of THEME_VARIABLES) {
    if (overrides === null) {
      root.style.removeProperty(name);
    } else {
      root.style.setProperty(name, overrides[name]);
    }
  }

  if (accent === null) {
    root.style.removeProperty('--accent');
  } else {
    root.style.setProperty('--accent', accent);
  }
};

/** OS がダークモードか。matchMedia が無い環境（テスト）ではライトとみなす。 */
export const systemPrefersDark = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;
