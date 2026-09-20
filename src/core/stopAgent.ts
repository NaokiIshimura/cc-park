import { canStop, stopUnsupportedReason } from '../shared/stopSupport.js';
import type { Agent } from '../types/agent.js';
import {
  execFileRunner,
  toCommandError,
  type CommandErrorKind,
  type CommandRunner,
} from './runCommand.js';

/** 停止失敗の種別。`unsupported` は実行前に弾いたケース。 */
export type StopErrorKind = CommandErrorKind | 'unsupported';

export interface StopError {
  readonly kind: StopErrorKind;
  readonly message: string;
}

export type StopAgentResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: StopError };

export interface StopAgentOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal | undefined;
  readonly runner?: CommandRunner;
  /** 実行するコマンド名（既定: claude） */
  readonly command?: string;
}

// stop はデーモンとのやり取りを伴うため、一覧取得より長めに待つ
const DEFAULT_TIMEOUT_MS = 10000;

const TIMEOUT_MESSAGE = 'claude stop がタイムアウトしました。';

// 既存の import 互換のため再輸出する
export { canStop, stopUnsupportedReason };

/** コマンド引数を組み立てる。 */
export const buildStopArgs = (id: string): string[] => ['stop', id];

/**
 * `claude stop <id>` を実行して background セッションを停止する。
 * 会話自体は保持されるため、`claude attach <id>` で再開できる。
 *
 * 失敗は例外ではなく Result 型で返し、TUI を落とさない。
 */
export const stopAgent = async (
  agent: Agent,
  options: StopAgentOptions = {},
): Promise<StopAgentResult> => {
  if (!canStop(agent)) {
    return { ok: false, error: { kind: 'unsupported', message: stopUnsupportedReason(agent) } };
  }

  const runner = options.runner ?? execFileRunner;
  const command = options.command ?? 'claude';

  try {
    await runner(command, buildStopArgs(agent.id), {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      signal: options.signal,
    });
  } catch (error) {
    const { kind, message } = toCommandError(error, TIMEOUT_MESSAGE);
    return {
      ok: false,
      error: kind === 'aborted' ? { kind, message: 'stop を中断しました。' } : { kind, message },
    };
  }

  return { ok: true };
};
