import type { Agent } from '../types/agent.js';

/**
 * OS プロセスとして kill できるセッションかどうか。
 * 対象は PID を持つ interactive セッションのみ（background は `claude stop` を使う）。
 */
export const canKill = (agent: Agent): agent is Agent & { readonly pid: number } =>
  agent.pid !== undefined && agent.pid > 0;

/** kill できない理由を利用者向けの文言で返す。 */
export const killUnsupportedReason = (agent: Agent): string =>
  agent.kind === 'interactive'
    ? 'kill に必要な PID を取得できませんでした'
    : 'background セッションは kill できません（s で stop してください）';
