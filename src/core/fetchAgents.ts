import type { Agent, RawAgent } from '../types/agent.js';
import { normalizeAgents } from './normalizeAgent.js';
import { readSessionMeta, type ReadSessionMetaOptions } from './readSessionMeta.js';
import {
  execFileRunner,
  toCommandError,
  type CommandErrorKind,
  type CommandRunner,
} from './runCommand.js';

// 既存の import 互換のため再輸出する
export { execFileRunner, type CommandRunner };

/** 取得失敗の種別。UI 側で対処法を出し分けるために使う。 */
export type FetchErrorKind = CommandErrorKind | 'parse';

export interface FetchError {
  readonly kind: FetchErrorKind;
  readonly message: string;
}

export type FetchAgentsResult =
  | { readonly ok: true; readonly agents: Agent[] }
  | { readonly ok: false; readonly error: FetchError };

export interface FetchAgentsOptions {
  /** 完了済みバックグラウンドセッションも含める */
  readonly all?: boolean;
  /** 指定パス配下のバックグラウンドセッションのみ取得する */
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal | undefined;
  readonly runner?: CommandRunner;
  /** 実行するコマンド名（既定: claude） */
  readonly command?: string;
  /**
   * transcript を読んで最終プロンプト / トークン使用量を補完する。
   * 既定は false。表示しないときにファイル読み取りを起こさないためのオプトイン。
   */
  readonly meta?: boolean;
  /** `~/.claude/projects` を探す起点 */
  readonly home?: string;
  /** コンテキスト上限の明示指定 */
  readonly contextLimit?: number | undefined;
  /** transcript 読み取りの実装。テストから差し替える */
  readonly metaReader?: (
    agent: Agent,
    options: ReadSessionMetaOptions,
  ) => Promise<Agent['meta']>;
}

const DEFAULT_TIMEOUT_MS = 5000;

const TIMEOUT_MESSAGE = 'claude agents --json がタイムアウトしました。';

/** コマンド引数を組み立てる。 */
export const buildArgs = (options: Pick<FetchAgentsOptions, 'all' | 'cwd'>): string[] => {
  const args = ['agents', '--json'];
  if (options.all === true) {
    args.push('--all');
  }
  if (options.cwd !== undefined && options.cwd !== '') {
    args.push('--cwd', options.cwd);
  }
  return args;
};

/**
 * `claude agents --json` を実行してセッション一覧を取得する。
 * 失敗は例外ではなく Result 型で返すため、ポーリングループを止めない。
 */
export const fetchAgents = async (
  options: FetchAgentsOptions = {},
): Promise<FetchAgentsResult> => {
  const runner = options.runner ?? execFileRunner;
  const command = options.command ?? 'claude';

  let stdout: string;
  try {
    stdout = await runner(command, buildArgs(options), {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      signal: options.signal,
    });
  } catch (error) {
    const { kind, message } = toCommandError(error, TIMEOUT_MESSAGE);
    // 中断メッセージだけは取得処理向けの文言に差し替える
    return {
      ok: false,
      error: kind === 'aborted' ? { kind, message: '取得を中断しました。' } : { kind, message },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      error: { kind: 'parse', message: 'claude agents --json の出力を解析できませんでした。' },
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      error: { kind: 'parse', message: 'claude agents --json の出力が配列ではありません。' },
    };
  }

  const agents = normalizeAgents(parsed as RawAgent[]);
  if (options.meta !== true) {
    return { ok: true, agents };
  }

  return { ok: true, agents: await attachMeta(agents, options) };
};

/**
 * transcript 由来の付加情報を合成する。
 *
 * ここで合成しておくと、GUI では main プロセスで読んだ結果がそのまま
 * `FetchAgentsResult` に載るため、IPC の口を増やさずに renderer まで届く。
 */
const attachMeta = async (
  agents: readonly Agent[],
  options: FetchAgentsOptions,
): Promise<Agent[]> => {
  const readMeta = options.metaReader ?? readSessionMeta;
  const metaOptions: ReadSessionMetaOptions = {
    ...(options.home === undefined ? {} : { home: options.home }),
    contextLimit: options.contextLimit,
  };

  return Promise.all(
    agents.map(async (agent) => ({ ...agent, meta: await readMeta(agent, metaOptions) })),
  );
};
