import { existsSync } from 'node:fs';
import type { Schedule } from '../shared/schedule.js';
import {
  execFileRunner,
  toCommandError,
  type CommandErrorKind,
  type CommandRunner,
} from './runCommand.js';

/**
 * 予約から Claude Code のセッションを起動する。
 *
 * `claude --bg <prompt>` で起動した background セッションは `claude agents --json` に載るため、
 * 起動した直後から cc-park の一覧にキャラクターとして現れる。
 * ターミナルを開く方式（osascript など）は、この一覧に載らないので採らない。
 *
 * 失敗は例外ではなく Result 型で返し、スケジューラのループを止めない。
 */

/** 起動失敗の種別。`missing-cwd` は実行前に弾いたケース。 */
export type LaunchErrorKind = CommandErrorKind | 'missing-cwd';

export interface LaunchError {
  readonly kind: LaunchErrorKind;
  readonly message: string;
}

export type LaunchAgentResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: LaunchError };

export interface LaunchAgentOptions {
  readonly timeoutMs?: number;
  readonly runner?: CommandRunner;
  /** 実行するコマンド名（既定: claude） */
  readonly command?: string;
  /** ディレクトリの実在確認。テストから差し替える */
  readonly exists?: (path: string) => boolean;
}

/**
 * `--bg` はセッションを起動して即座に戻るが、起動直後は設定の読み込みなどで
 * 数秒かかることがある。一覧取得より長めに待つ。
 */
const DEFAULT_TIMEOUT_MS = 15000;

const TIMEOUT_MESSAGE = 'claude --bg がタイムアウトしました。';

/** コマンド引数を組み立てる。プロンプトはシェルを経由しないのでそのまま渡す。 */
export const buildLaunchArgs = (prompt: string): string[] => ['--bg', prompt];

/** 短縮 ID（`claude agents --json` の `id`）の形。 */
const LAUNCHED_ID_PATTERN = /\b[0-9a-f]{8,}\b/;

/**
 * `claude --bg` の出力からセッション ID を取り出す。
 *
 * 出力は `backgrounded · <id>` に続けて操作のヒント（`claude stop <id>  stop this session` など）が
 * 並ぶ複数行なので、行ではなく最初に現れる ID の形をしたトークンを採る。
 * 起動の成否は終了コードで判断済みなので、読み取れなければ空文字でよい。
 */
export const parseLaunchedId = (stdout: string): string =>
  LAUNCHED_ID_PATTERN.exec(stdout)?.[0] ?? '';

/** 予約に書かれたディレクトリで `claude --bg <prompt>` を実行する。 */
export const launchAgent = async (
  schedule: Pick<Schedule, 'cwd' | 'prompt'>,
  options: LaunchAgentOptions = {},
): Promise<LaunchAgentResult> => {
  const exists = options.exists ?? existsSync;
  if (!exists(schedule.cwd)) {
    return {
      ok: false,
      error: {
        kind: 'missing-cwd',
        message: `ディレクトリが見つかりません: ${schedule.cwd}`,
      },
    };
  }

  const runner = options.runner ?? execFileRunner;
  const command = options.command ?? 'claude';

  try {
    const stdout = await runner(command, buildLaunchArgs(schedule.prompt), {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      signal: undefined,
      cwd: schedule.cwd,
    });
    return { ok: true, id: parseLaunchedId(stdout) };
  } catch (error) {
    return { ok: false, error: toCommandError(error, TIMEOUT_MESSAGE) };
  }
};
