import type { Agent, TransitionEvent } from '../types/agent.js';

/**
 * 前回と今回のスナップショットを sessionId で突き合わせ、状態遷移を算出する。
 *
 * `previous` が null（初回ポーリング）の場合は、起動直後の通知洪水を防ぐため
 * 空配列を返す。新規出現したセッションも `from: null` として返すが、
 * 通知するかどうかは呼び出し側の判断に委ねる。
 */
export const diffAgents = (
  previous: readonly Agent[] | null,
  current: readonly Agent[],
  at: number,
): TransitionEvent[] => {
  if (previous === null) {
    return [];
  }

  const previousBySessionId = new Map(previous.map((agent) => [agent.sessionId, agent]));

  const events: TransitionEvent[] = [];
  for (const agent of current) {
    const before = previousBySessionId.get(agent.sessionId);
    const from = before?.state ?? null;

    if (from === agent.state) {
      continue;
    }

    events.push({
      sessionId: agent.sessionId,
      name: agent.name,
      from,
      to: agent.state,
      at,
    });
  }

  return events;
};
