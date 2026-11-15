/**
 * 起動元のアプリが分からないセッションを、どのアプリで開くかの設定。
 *
 * 行のダブルクリック・`Enter` で開くとき、起動元の端末が分かればそこへ移動する。
 * 分からない background セッションは、ここで選んだ端末アプリの新しいウィンドウで
 * `claude attach` して開く。`copy` は開かずに、開くコマンドをコピーするだけにする。
 */

/** AppleScript で新しいウィンドウにコマンドを打ち込める端末アプリ（Ghostty は 1.3 以降）。 */
export type ScriptTerminal = 'Terminal' | 'iTerm2' | 'Ghostty';

/**
 * AppleScript を持たず、起動時の引数で実行するコマンドを渡す端末アプリ（`open -na <アプリ> --args …`）。
 * Warp は外からコマンドを渡して実行する手段が無いので入れていない。
 */
export type ArgsTerminal = 'WezTerm' | 'kitty' | 'Alacritty';

/** 開くのに使える端末アプリ。 */
export type FallbackTerminal = ScriptTerminal | ArgsTerminal;

export type FallbackApp = FallbackTerminal | 'copy';

/** 設定画面に並べる順。 */
export const FALLBACK_APPS: readonly FallbackApp[] = [
  'Terminal',
  'iTerm2',
  'Ghostty',
  'WezTerm',
  'kitty',
  'Alacritty',
  'copy',
];

/** 設定画面での表記。 */
export const FALLBACK_APP_LABELS: Readonly<Record<FallbackApp, string>> = {
  Terminal: 'Terminal',
  iTerm2: 'iTerm2',
  Ghostty: 'Ghostty',
  WezTerm: 'WezTerm',
  kitty: 'kitty',
  Alacritty: 'Alacritty',
  copy: '開かずにコマンドをコピーする',
};

export interface OpenSettings {
  /** 起動元のアプリが分からないセッションを開くアプリ */
  readonly fallbackApp: FallbackApp;
}

/** 既定は macOS に必ずある Terminal。 */
export const DEFAULT_OPEN_SETTINGS: OpenSettings = { fallbackApp: 'Terminal' };

const isFallbackApp = (value: unknown): value is FallbackApp =>
  FALLBACK_APPS.some((app) => app === value);

/**
 * 保存ファイルや renderer から来た値を設定として解釈する。
 * 解釈できない項目は既定値で埋める（この設定を持たない古い保存ファイルは既定として読む）。
 */
export const toOpenSettings = (value: unknown): OpenSettings => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_OPEN_SETTINGS;
  }
  const { fallbackApp } = value as Partial<Record<keyof OpenSettings, unknown>>;
  return {
    fallbackApp: isFallbackApp(fallbackApp) ? fallbackApp : DEFAULT_OPEN_SETTINGS.fallbackApp,
  };
};
