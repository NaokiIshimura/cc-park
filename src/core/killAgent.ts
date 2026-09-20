import { canKill, killUnsupportedReason } from '../shared/killSupport.js';
import type { Agent } from '../types/agent.js';

// 既存の import 互換のため再輸出する
export { canKill, killUnsupportedReason };

/** kill 失敗の種別。`unsupported` は実行前に弾いたケース。 */
export type KillErrorKind = 'unsupported' | 'not-found' | 'permission' | 'failed';

export interface KillError {
  readonly kind: KillErrorKind;
  readonly message: string;
}

export type KillAgentResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: KillError };

/** プロセスへシグナルを送る手段。テストで差し替えられるようにしている。 */
export type SignalSender = (pid: number, signal: NodeJS.Signals) => void;

/** process.kill ベースの既定の送出手段。 */
export const processSignalSender: SignalSender = (pid, signal) => {
  process.kill(pid, signal);
};

/**
 * 既定のシグナル。
 *
 * claude は終了時に会話を保存するため、いきなり SIGKILL で落とさず
 * 後片付けの余地を残す SIGTERM を送る。
 */
export const DEFAULT_KILL_SIGNAL: NodeJS.Signals = 'SIGTERM';

export interface KillAgentOptions {
  readonly signal?: NodeJS.Signals;
  readonly sender?: SignalSender;
}

/** シグナル送出の失敗を種別へ分類する。 */
export const toKillError = (error: unknown): KillError => {
  const code = (error as NodeJS.ErrnoException | null)?.code;

  if (code === 'ESRCH') {
    return {
      kind: 'not-found',
      message: 'プロセスが見つかりませんでした（すでに終了している可能性があります）。',
    };
  }
  if (code === 'EPERM') {
    return { kind: 'permission', message: 'プロセスを終了する権限がありません。' };
  }
  return {
    kind: 'failed',
    message: error instanceof Error ? error.message : String(error),
  };
};

/**
 * セッションの OS プロセスへシグナルを送って終了させる。
 *
 * `claude stop` が使えない interactive セッションを止めるための手段。
 * 失敗は例外ではなく Result 型で返し、UI を落とさない。
 */
export const killAgent = async (
  agent: Agent,
  options: KillAgentOptions = {},
): Promise<KillAgentResult> => {
  if (!canKill(agent)) {
    return { ok: false, error: { kind: 'unsupported', message: killUnsupportedReason(agent) } };
  }

  const sender = options.sender ?? processSignalSender;

  try {
    sender(agent.pid, options.signal ?? DEFAULT_KILL_SIGNAL);
  } catch (error) {
    return { ok: false, error: toKillError(error) };
  }

  return { ok: true };
};
