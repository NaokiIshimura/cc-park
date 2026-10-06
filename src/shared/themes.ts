/**
 * GUI の配色テーマ。
 *
 * 配色はすべて CSS 変数で表すので、テーマは「CSS 変数の値の組」として定義する。
 * main プロセス（起動直後の背景色・OS 部品の明暗）と renderer（変数の適用）の双方が参照するため、
 * UI 非依存のここに置く。
 *
 * `light` / `dark` は `gui/renderer/styles.css` の既定値と同じ値を持つ（styles.css が正。
 * 一致は `themes.test.ts` で検査する）。`system` は OS の外観に追従し、どちらかに解決される。
 */

/** OS が描く部品（スクロールバー・フォーム部品）の明暗。 */
export type ThemeBase = 'light' | 'dark';

export const THEME_IDS = [
  'system',
  'light',
  'dark',
  'navy',
  'forest',
  'slate',
  'sepia',
  'high-contrast',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** `system` を除いた、値を持つテーマ。 */
export type PaletteId = Exclude<ThemeId, 'system'>;

/** テーマが定義する CSS 変数。抜けがあると既定値が混ざるため、すべて必須にする。 */
export const THEME_VARIABLES = [
  '--bg',
  '--surface',
  '--surface-selected',
  '--border',
  '--frame',
  '--fg',
  '--fg-muted',
  '--ink-default',
  '--ink-cyan',
  '--ink-yellow',
  '--ink-green',
  '--ink-green-bright',
  '--ink-gray',
  '--ink-red',
  '--ink-magenta',
  '--ink-blue-bright',
  '--ink-white',
] as const;

export type ThemeVariable = (typeof THEME_VARIABLES)[number];

export interface Palette {
  readonly id: PaletteId;
  readonly label: string;
  readonly base: ThemeBase;
  readonly variables: Readonly<Record<ThemeVariable, string>>;
}

/**
 * 配色の一覧。
 *
 * 黒いターミナルの上に重ねても境界が分かるよう、ダーク系のプリセットは明るさより
 * 色相（紺・深緑・青灰）で区別する。`--frame` はウィンドウ外周の枠線の色。
 */
export const PALETTES: Readonly<Record<PaletteId, Palette>> = {
  light: {
    id: 'light',
    label: 'ライト',
    base: 'light',
    variables: {
      '--bg': '#fbfbfd',
      '--surface': '#ffffff',
      '--surface-selected': '#e8f1ff',
      '--border': '#e2e5eb',
      '--frame': '#c4c9d4',
      '--fg': '#1b1f24',
      '--fg-muted': '#6b7280',
      '--ink-default': '#1b1f24',
      '--ink-cyan': '#0e7490',
      '--ink-yellow': '#a16207',
      '--ink-green': '#15803d',
      '--ink-green-bright': '#15983f',
      '--ink-gray': '#6b7280',
      '--ink-red': '#b91c1c',
      '--ink-magenta': '#a21caf',
      '--ink-blue-bright': '#1d4ed8',
      '--ink-white': '#111827',
    },
  },
  dark: {
    id: 'dark',
    label: 'ダーク',
    base: 'dark',
    variables: {
      '--bg': '#181b23',
      '--surface': '#1e222c',
      '--surface-selected': '#283244',
      '--border': '#323846',
      '--frame': '#6b7385',
      '--fg': '#e5e7eb',
      '--fg-muted': '#9aa3b2',
      '--ink-default': '#e5e7eb',
      '--ink-cyan': '#22d3ee',
      '--ink-yellow': '#fbbf24',
      '--ink-green': '#4ade80',
      '--ink-green-bright': '#86efac',
      '--ink-gray': '#9aa3b2',
      '--ink-red': '#f87171',
      '--ink-magenta': '#e879f9',
      '--ink-blue-bright': '#60a5fa',
      '--ink-white': '#f9fafb',
    },
  },
  navy: {
    id: 'navy',
    label: 'ネイビー',
    base: 'dark',
    variables: {
      '--bg': '#13234a',
      '--surface': '#1a2d5a',
      '--surface-selected': '#243c73',
      '--border': '#2f4a85',
      '--frame': '#6d8fd8',
      '--fg': '#e8eefc',
      '--fg-muted': '#a9b8dc',
      '--ink-default': '#e8eefc',
      '--ink-cyan': '#5eead4',
      '--ink-yellow': '#fcd34d',
      '--ink-green': '#6ee7a0',
      '--ink-green-bright': '#a7f3c5',
      '--ink-gray': '#a9b8dc',
      '--ink-red': '#fca5a5',
      '--ink-magenta': '#f0abfc',
      '--ink-blue-bright': '#93c5fd',
      '--ink-white': '#ffffff',
    },
  },
  forest: {
    id: 'forest',
    label: 'フォレスト',
    base: 'dark',
    variables: {
      '--bg': '#132a22',
      '--surface': '#18352b',
      '--surface-selected': '#22473a',
      '--border': '#2d5a4a',
      '--frame': '#5fae8c',
      '--fg': '#e6f4ec',
      '--fg-muted': '#a3c9b6',
      '--ink-default': '#e6f4ec',
      '--ink-cyan': '#67e8f9',
      '--ink-yellow': '#fde047',
      '--ink-green': '#86efac',
      '--ink-green-bright': '#bbf7d0',
      '--ink-gray': '#a3c9b6',
      '--ink-red': '#fca5a5',
      '--ink-magenta': '#f5b4fc',
      '--ink-blue-bright': '#93c5fd',
      '--ink-white': '#ffffff',
    },
  },
  slate: {
    id: 'slate',
    label: 'スレート',
    base: 'dark',
    variables: {
      '--bg': '#2a3140',
      '--surface': '#313949',
      '--surface-selected': '#3c475c',
      '--border': '#4a5568',
      '--frame': '#8a97ad',
      '--fg': '#eef1f6',
      '--fg-muted': '#b4bdcc',
      '--ink-default': '#eef1f6',
      '--ink-cyan': '#67e8f9',
      '--ink-yellow': '#fcd34d',
      '--ink-green': '#86efac',
      '--ink-green-bright': '#bbf7d0',
      '--ink-gray': '#b4bdcc',
      '--ink-red': '#fca5a5',
      '--ink-magenta': '#f0abfc',
      '--ink-blue-bright': '#93c5fd',
      '--ink-white': '#ffffff',
    },
  },
  sepia: {
    id: 'sepia',
    label: 'セピア',
    base: 'light',
    variables: {
      '--bg': '#f4ecd8',
      '--surface': '#fbf5e6',
      '--surface-selected': '#eadcb8',
      '--border': '#d8c8a2',
      '--frame': '#a58c5c',
      '--fg': '#3b2f1e',
      '--fg-muted': '#6e5c40',
      '--ink-default': '#3b2f1e',
      '--ink-cyan': '#0e6a7a',
      '--ink-yellow': '#8a5200',
      '--ink-green': '#2f6b1f',
      '--ink-green-bright': '#3d7a28',
      '--ink-gray': '#6e5c40',
      '--ink-red': '#a3261c',
      '--ink-magenta': '#8e2a8a',
      '--ink-blue-bright': '#24479a',
      '--ink-white': '#2a2116',
    },
  },
  'high-contrast': {
    id: 'high-contrast',
    label: 'ハイコントラスト',
    base: 'dark',
    variables: {
      '--bg': '#000000',
      '--surface': '#0a0a0a',
      '--surface-selected': '#1f1f1f',
      '--border': '#5c5c5c',
      '--frame': '#ffd400',
      '--fg': '#ffffff',
      '--fg-muted': '#d4d4d4',
      '--ink-default': '#ffffff',
      '--ink-cyan': '#00ffff',
      '--ink-yellow': '#ffff00',
      '--ink-green': '#00ff66',
      '--ink-green-bright': '#7dffb0',
      '--ink-gray': '#c8c8c8',
      '--ink-red': '#ff6b6b',
      '--ink-magenta': '#ff77ff',
      '--ink-blue-bright': '#7fb2ff',
      '--ink-white': '#ffffff',
    },
  },
};

/** 選択肢として並べる順。 */
export const THEME_LABELS: Readonly<Record<ThemeId, string>> = {
  system: 'OS に合わせる',
  ...Object.fromEntries(Object.values(PALETTES).map((palette) => [palette.id, palette.label])),
} as Record<ThemeId, string>;

export const DEFAULT_THEME: ThemeId = 'system';

export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);

/** アクセント色として受け付ける形式（`#rgb` / `#rrggbb`）。 */
const ACCENT_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isAccentColor = (value: unknown): value is string =>
  typeof value === 'string' && ACCENT_PATTERN.test(value);

/**
 * 見た目の設定。
 *
 * `accent` は枠線・選択行・ON のトグルに使う色。null なら配色ごとの既定（`--ink-cyan`）。
 */
export interface Appearance {
  readonly theme: ThemeId;
  readonly accent: string | null;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: DEFAULT_THEME, accent: null };

/**
 * 外から来た値（保存ファイル・IPC）を見た目の設定として解釈する。
 * 解釈できない項目は既定値で埋め、例外にはしない。
 */
export const toAppearance = (value: unknown): Appearance => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_APPEARANCE;
  }
  const { theme, accent } = value as Partial<Record<keyof Appearance, unknown>>;
  return {
    theme: isThemeId(theme) ? theme : DEFAULT_APPEARANCE.theme,
    accent: isAccentColor(accent) ? accent : DEFAULT_APPEARANCE.accent,
  };
};

/** `system` を OS の外観で解決し、実際に使う配色を返す。 */
export const resolvePalette = (theme: ThemeId, systemPrefersDark: boolean): Palette => {
  if (theme === 'system') {
    return systemPrefersDark ? PALETTES.dark : PALETTES.light;
  }
  return PALETTES[theme];
};

/** OS 部品の明暗の指定（Electron の `nativeTheme.themeSource` に渡す値）。 */
export const themeSourceOf = (theme: ThemeId): 'system' | ThemeBase =>
  theme === 'system' ? 'system' : PALETTES[theme].base;

/**
 * 起動時の見た目を決める。
 *
 * CLI で明示した値 > 保存済みの値 > 既定値 の順に採る。
 * CLI 側の null は「指定しなかった」を表す。
 */
export const resolveAppearance = (
  flags: { readonly theme: ThemeId | null; readonly accent: string | null },
  saved: Appearance,
): Appearance => ({
  theme: flags.theme ?? saved.theme,
  accent: flags.accent ?? saved.accent,
});

/** `#rrggbb` を相対輝度（WCAG 2.x）へ変換する。 */
export const relativeLuminance = (hex: string): number => {
  const normalized =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(normalized.slice(start, start + 2), 16) / 255;
    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [red = 0, green = 0, blue = 0] = channels;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

/** 2 色のコントラスト比（1〜21）。 */
export const contrastRatio = (first: string, second: string): number => {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
};
