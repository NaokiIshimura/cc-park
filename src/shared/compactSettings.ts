/**
 * GUI のミニ表示（ウィンドウを AA のタイルだけに畳む表示）の設定。
 *
 * renderer（切り替え）・main（起動時の値の受け渡し）・core（`settings.json` への保存）の
 * いずれからも使うため、UI に依存しない値と判定だけを置く。
 */

/** ミニ表示の切り替え。ヘッダの `mini` トグル・`m` キーで ON にし、ミニ表示の `開く` で OFF に戻す。 */
export type CompactMode = 'off' | 'on';

/** 初回起動時の切り替え。邪魔に感じたときに自分で ON にする機能なので、既定では畳まない。 */
export const DEFAULT_COMPACT_MODE: CompactMode = 'off';

/**
 * ミニ表示の並び。`vertical` は縦 1 列（画面の左右の端に置く）、`horizontal` は横 1 列（画面の上下の端に置く）。
 * ミニ表示の `縦` / `横` ボタンで切り替える。
 */
export type CompactLayout = 'vertical' | 'horizontal';

/** 初回起動時の並び。画面の横に置いておく使い方を主に想定し、縦 1 列から始める。 */
export const DEFAULT_COMPACT_LAYOUT: CompactLayout = 'vertical';

/** もう一方の並びを返す。 */
export const nextCompactLayout = (layout: CompactLayout): CompactLayout =>
  layout === 'vertical' ? 'horizontal' : 'vertical';

/** 保存するミニ表示の設定。次回の起動時に同じ表示から再開する。 */
export interface CompactSettings {
  readonly mode: CompactMode;
  readonly layout: CompactLayout;
}

export const DEFAULT_COMPACT_SETTINGS: CompactSettings = {
  mode: DEFAULT_COMPACT_MODE,
  layout: DEFAULT_COMPACT_LAYOUT,
};

const isCompactMode = (value: unknown): value is CompactMode => value === 'off' || value === 'on';

const isCompactLayout = (value: unknown): value is CompactLayout =>
  value === 'vertical' || value === 'horizontal';

/**
 * 保存ファイルや renderer から来た値をミニ表示の設定として解釈する。
 * 解釈できない項目は既定値で埋める（ミニ表示の設定を持たない古い保存ファイルは既定として読む）。
 */
export const toCompactSettings = (value: unknown): CompactSettings => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_COMPACT_SETTINGS;
  }
  const { mode, layout } = value as Partial<Record<keyof CompactSettings, unknown>>;
  return {
    mode: isCompactMode(mode) ? mode : DEFAULT_COMPACT_SETTINGS.mode,
    layout: isCompactLayout(layout) ? layout : DEFAULT_COMPACT_SETTINGS.layout,
  };
};
