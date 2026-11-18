import { isAccentColor, isThemeId, THEME_IDS, type ThemeId } from '../shared/themes.js';
import { encodeGuiOptions, type GuiOptions } from './config.js';

/** electron を解決できなかったときの案内。 */
export const ELECTRON_MISSING_MESSAGE = [
  'cc-park を起動できませんでした: electron が見つかりません。',
  'npm install をやり直してください。',
].join('\n');

/** 削除したターミナル (CLI) モードのフラグ。黙って無視すると気づけないため、起動前に止める。 */
export const REMOVED_CLI_FLAGS = ['cli', 'once'] as const;

/** 削除したフラグを指定されたときの案内。 */
export const REMOVED_CLI_MESSAGE =
  'ターミナル (CLI) モードは削除されました。--cli / --once は指定できません。';

/** 削除したフラグが argv に含まれていれば、その名前を返す。 */
export const findRemovedFlag = (argv: readonly string[]): string | null =>
  REMOVED_CLI_FLAGS.find((name) => isFlagGiven(argv, name)) ?? null;

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

/** `--theme` に知らない名前を指定されたときの案内。 */
export const INVALID_THEME_MESSAGE = `--theme には次のいずれかを指定してください: ${THEME_IDS.join(', ')}`;

/** `--accent` の形式が違うときの案内。 */
export const INVALID_ACCENT_MESSAGE = '--accent には #rgb または #rrggbb 形式の色を指定してください。';

export type AppearanceFlagsDecision =
  | {
      readonly ok: true;
      readonly theme: ThemeId | null;
      readonly accent: string | null;
      readonly frame: boolean | null;
    }
  | { readonly ok: false; readonly message: string };

/**
 * `--theme` / `--accent` / `--frame` を検査する。指定しなかったものは null（保存済みの設定に従う）。
 *
 * GUI 側でも不正値は既定へ倒すが、明示した指定が黙って無視されると気づけないため、
 * 起動前にここで止める。
 */
export const resolveAppearanceFlags = (flags: {
  readonly theme: string | undefined;
  readonly accent: string | undefined;
  /** 明示されなかった場合は undefined（meow の既定値と区別するため、呼び出し側で argv を見て渡す） */
  readonly frame: boolean | undefined;
}): AppearanceFlagsDecision => {
  if (flags.theme !== undefined && !isThemeId(flags.theme)) {
    return { ok: false, message: INVALID_THEME_MESSAGE };
  }
  if (flags.accent !== undefined && !isAccentColor(flags.accent)) {
    return { ok: false, message: INVALID_ACCENT_MESSAGE };
  }
  return {
    ok: true,
    theme: flags.theme ?? null,
    accent: flags.accent ?? null,
    frame: flags.frame ?? null,
  };
};

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
 * 増えるため、`() => import('electron')` の指定は呼び出し側（cli.ts）に置く。
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
