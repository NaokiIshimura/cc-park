import { encodeGuiOptions, GUI_DEFAULT_FLAGS, type GuiOptions } from './config.js';

/** electron を解決できなかったときの案内。勝手に CLI へ倒さず、ここで終了させる。 */
export const ELECTRON_MISSING_MESSAGE = [
  'GUI モードを起動できませんでした: electron が見つかりません。',
  'npm install をやり直すか、--cli を付けてターミナル (CLI) モードで起動してください。',
].join('\n');

/** `--gui` と併用できないフラグを指定されたときの案内。 */
export const GUI_ONCE_CONFLICT_MESSAGE =
  '--gui と --once は同時に指定できません（GUI には 1 回だけ描画する動作がありません）。';

/** 起動モードを両方指定されたときの案内。 */
export const MODE_CONFLICT_MESSAGE = '--cli と --gui は同時に指定できません。';

/** 起動モード。既定は GUI で、`--cli` を付けるとターミナルの TUI になる。 */
export type StartupMode = 'gui' | 'cli';

export interface StartupFlags {
  readonly cli: boolean;
  readonly gui: boolean;
  readonly once: boolean;
}

export type StartupDecision =
  | { readonly ok: true; readonly mode: StartupMode }
  | { readonly ok: false; readonly message: string };

/**
 * フラグから起動モードを決める。
 *
 * 標準出力が TTY かどうかは判断に使わない。ランチャーやエディタから起動した場合は
 * 非 TTY でも GUI を開きたいため、モードの決定は明示のフラグだけに任せる。
 */
export const resolveStartupMode = (flags: StartupFlags): StartupDecision => {
  if (flags.cli && flags.gui) {
    return { ok: false, message: MODE_CONFLICT_MESSAGE };
  }
  if (flags.gui && flags.once) {
    return { ok: false, message: GUI_ONCE_CONFLICT_MESSAGE };
  }
  if (flags.cli) {
    return { ok: true, mode: 'cli' };
  }
  if (flags.gui) {
    return { ok: true, mode: 'gui' };
  }
  // --once は「1 回描画して終わる」CLI 固有の動作なので、単独指定でも CLI とみなす
  if (flags.once) {
    return { ok: true, mode: 'cli' };
  }
  return { ok: true, mode: 'gui' };
};

/** GUI 側で既定値を差し替える表示オプション。 */
export type GuiDisplayFlags = { readonly [K in keyof typeof GUI_DEFAULT_FLAGS]: boolean };

/**
 * フラグが argv に明示されているか。
 *
 * meow は指定の無い boolean も既定値で埋めてしまい「指定しなかった」と区別できないため、
 * argv を直接見る。`--x` / `--no-x` / `--x=false` のいずれも「明示した」とみなす。
 */
export const isFlagGiven = (argv: readonly string[], name: string): boolean =>
  argv.some(
    (argument) =>
      argument === `--${name}` ||
      argument === `--no-${name}` ||
      argument.startsWith(`--${name}=`),
  );

/**
 * GUI の表示オプションを決める。
 *
 * 明示されていないものは GUI 用の既定（`GUI_DEFAULT_FLAGS`）へ倒し、
 * `--no-all` のように明示した場合はそちらを優先する。
 */
export const resolveGuiFlags = (
  flags: GuiDisplayFlags,
  argv: readonly string[],
): GuiDisplayFlags => ({
  all: isFlagGiven(argv, 'all') ? flags.all : GUI_DEFAULT_FLAGS.all,
  prompt: isFlagGiven(argv, 'prompt') ? flags.prompt : GUI_DEFAULT_FLAGS.prompt,
  tokens: isFlagGiven(argv, 'tokens') ? flags.tokens : GUI_DEFAULT_FLAGS.tokens,
});

/** Electron へ渡す引数を組み立てる。 */
export const buildGuiArgs = (mainPath: string, options: GuiOptions): string[] => [
  mainPath,
  encodeGuiOptions(options),
];

/**
 * Electron を子プロセスとして起動するための環境変数を組み立てる。
 *
 * `ELECTRON_RUN_AS_NODE` が設定されていると Electron が素の Node として動き、
 * ウィンドウが開かないまま終了してしまうため取り除く。
 */
export const buildGuiEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const next = { ...env };
  delete next['ELECTRON_RUN_AS_NODE'];
  return next;
};

/**
 * electron パッケージの読み込み。
 *
 * 既定値を持たせると「electron を実際に読み込む」以外に検証しようがない分岐が
 * 増えるため、`() => import('electron')` の指定は呼び出し側（cli）に置く。
 */
export type ElectronImporter = () => Promise<unknown>;

/**
 * electron の実行ファイルパスを解決する。
 * electron パッケージは CommonJS で実行ファイルのパスを default に持つ。
 */
export const resolveElectronPath = async (
  importer: ElectronImporter,
): Promise<string | null> => {
  let loaded: unknown;
  try {
    loaded = await importer();
  } catch {
    return null;
  }

  const path = (loaded as { readonly default?: unknown } | null)?.default;
  return typeof path === 'string' && path !== '' ? path : null;
};
