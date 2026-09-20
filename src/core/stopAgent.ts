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

/**
 * `claude stop` を適用できるセッションかどうか。
 * 対象は短縮 ID を持つ background セッションのみ（interactive は CLI が非対応）。
 */
export const canStop = (agent: Agent): agent is Agent & { readonly id: string } =>
  agent.kind === 'background' && agent.id !== undefined && agent.id !== '';

/** stop できない理由を利用者向けの文言で返す。 */
export const stopUnsupportedReason = (agent: Agent): string =>
  agent.kind === 'background'
    ? 'stop に必要な ID を取得できませんでした'
    : 'interactive セッションは stop できません（background のみ対応）';

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
