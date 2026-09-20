/** CLI から GUI へ設定を引き渡すフラグ名。 */
export const CONFIG_FLAG = '--cc-park-config';

/** CLI 由来の起動オプション。 */
export interface GuiOptions {
  readonly intervalMs: number;
  readonly all: boolean;
  readonly cwd: string | undefined;
  readonly notify: boolean;
  readonly highlightMs: number;
  readonly selfSessionId: string | null;
}

/**
 * ウィンドウを最前面に固定するかの初期値。
 *
 * 他のアプリで作業しながら状態を見張る使い方が主なので、既定で固定する。
 * main プロセスのウィンドウ生成と renderer の初期表示が食い違わないよう、
 * 双方がこの定数を起点にする。
 */
export const DEFAULT_ALWAYS_ON_TOP = true;

/** renderer へ渡す起動時設定。main プロセスで解決した実行環境の情報を含む。 */
export interface GuiConfig extends GuiOptions {
  /** `~` 短縮に使うホームディレクトリ */
  readonly home: string;
  readonly platform: string;
  /** ウィンドウが最前面に固定されているか（main が実際に適用できた値） */
  readonly alwaysOnTop: boolean;
}

/** `npm run gui` のように CLI を経由せず起動した場合の既定値。 */
export const DEFAULT_GUI_OPTIONS: GuiOptions = {
  intervalMs: 2000,
  all: false,
  cwd: undefined,
  notify: true,
  highlightMs: 10_000,
  selfSessionId: null,
};

/** 起動オプションを `--cc-park-config=<json>` 形式の引数へ変換する。 */
export const encodeGuiOptions = (options: GuiOptions): string =>
  `${CONFIG_FLAG}=${JSON.stringify(options)}`;

/** 値が想定の型でなければ既定値へフォールバックする。 */
const pick = <T>(value: unknown, guard: (candidate: unknown) => boolean, fallback: T): T =>
  guard(value) ? (value as T) : fallback;

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: unknown): boolean => typeof value === 'boolean';
const isString = (value: unknown): boolean => typeof value === 'string';

/**
 * argv から起動オプションを取り出す。
 *
 * 設定は CLI が生成した JSON だが、手動起動や将来の引数変更でも GUI を落とさないよう、
 * 欠けている項目・型が合わない項目は既定値で埋める。
 */
export const parseGuiOptions = (argv: readonly string[]): GuiOptions => {
  const found = argv.find((argument) => argument.startsWith(`${CONFIG_FLAG}=`));
  if (found === undefined) {
    return DEFAULT_GUI_OPTIONS;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(found.slice(`${CONFIG_FLAG}=`.length));
  } catch {
    return DEFAULT_GUI_OPTIONS;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return DEFAULT_GUI_OPTIONS;
  }

  const source = parsed as Partial<Record<keyof GuiOptions, unknown>>;
  return {
    intervalMs: pick(source.intervalMs, isNumber, DEFAULT_GUI_OPTIONS.intervalMs),
    all: pick(source.all, isBoolean, DEFAULT_GUI_OPTIONS.all),
    cwd: pick<string | undefined>(source.cwd, isString, DEFAULT_GUI_OPTIONS.cwd),
    notify: pick(source.notify, isBoolean, DEFAULT_GUI_OPTIONS.notify),
    highlightMs: pick(source.highlightMs, isNumber, DEFAULT_GUI_OPTIONS.highlightMs),
    selfSessionId: pick<string | null>(
      source.selfSessionId,
      isString,
      DEFAULT_GUI_OPTIONS.selfSessionId,
    ),
  };
};
