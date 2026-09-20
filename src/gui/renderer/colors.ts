/**
 * Ink の color 名 → CSS 変数名の対応表。
 *
 * キャラクターやラベルの配色定義（`shared/characters.ts`）は TUI 由来の色名を持つため、
 * GUI では色名をそのまま使わず、この表を通して CSS 変数へ読み替える。
 */
export const INK_COLOR_VARIABLES: Readonly<Record<string, string>> = {
  cyan: '--ink-cyan',
  yellow: '--ink-yellow',
  green: '--ink-green',
  greenBright: '--ink-green-bright',
  gray: '--ink-gray',
  red: '--ink-red',
  magenta: '--ink-magenta',
  blueBright: '--ink-blue-bright',
  white: '--ink-white',
};

/** Ink の color 名を CSS の色値へ変換する。未知の色名は既定色にフォールバックする。 */
export const inkColor = (name: string): string =>
  `var(${INK_COLOR_VARIABLES[name] ?? '--ink-default'})`;
