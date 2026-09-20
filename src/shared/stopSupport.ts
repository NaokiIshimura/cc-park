import type { Agent } from '../types/agent.js';

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
