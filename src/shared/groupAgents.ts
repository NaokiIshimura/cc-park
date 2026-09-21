import type { Agent } from '../types/agent.js';
import { getAppearance } from './characters.js';
import { sortAgents } from './sortAgents.js';

/**
 * 作業ディレクトリごとにセッションをまとめる。
 *
 * 一覧では cwd を行ごとに繰り返さず、グループの見出しとして 1 回だけ出す。
 * 選択状態はフラットな添字のままにしたいので、描画順と一致する平坦化も併せて提供する。
 */

/** cwd が空のセッションをまとめる見出し。 */
export const UNKNOWN_CWD_LABEL = '(不明)';

export interface AgentGroup {
  /** グループキー。cwd をそのまま使う（空文字は「不明」扱い） */
  readonly cwd: string;
  readonly agents: readonly Agent[];
}

/** グループの並び順に使う代表値。要対応のセッションを持つグループを上に出す。 */
const groupPriority = (agents: readonly Agent[]): number =>
  agents.reduce(
    (best, agent) => Math.min(best, getAppearance(agent.state).priority),
    Number.POSITIVE_INFINITY,
  );

/** 同じ優先度のグループ同士は、より新しいセッションを持つ方を上に出す。 */
const groupStartedAt = (agents: readonly Agent[]): number =>
  agents.reduce((latest, agent) => Math.max(latest, agent.startedAt), 0);

/**
 * cwd ごとにまとめ、グループ内は従来どおり `sortAgents` で並べる。
 * cwd が空のグループは特定できないので必ず最後に置く。
 */
export const groupAgents = (agents: readonly Agent[]): AgentGroup[] => {
  const buckets = new Map<string, Agent[]>();
  for (const agent of agents) {
    const bucket = buckets.get(agent.cwd);
    if (bucket === undefined) {
      buckets.set(agent.cwd, [agent]);
      continue;
    }
    bucket.push(agent);
  }

  return [...buckets.entries()]
    .map(([cwd, members]) => ({ cwd, agents: sortAgents(members) }))
    .sort((a, b) => {
      // cwd 不明は内容によらず末尾へ送る
      const unknownDiff = Number(a.cwd === '') - Number(b.cwd === '');
      if (unknownDiff !== 0) {
        return unknownDiff;
      }

      const priorityDiff = groupPriority(a.agents) - groupPriority(b.agents);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return groupStartedAt(b.agents) - groupStartedAt(a.agents);
    });
};

/**
 * グループを描画順どおりに平坦化する。
 * 選択カーソルはこの配列への添字として扱うため、描画側と必ず同じ順序を使う。
 */
export const flattenGroups = (groups: readonly AgentGroup[]): Agent[] =>
  groups.flatMap((group) => [...group.agents]);
