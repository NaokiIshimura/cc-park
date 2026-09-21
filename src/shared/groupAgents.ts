import type { Agent } from '../types/agent.js';
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

/**
 * cwd ごとにまとめ、グループ内は従来どおり `sortAgents` で並べる。
 * グループ同士は cwd の昇順。cwd が空のグループは特定できないので必ず最後に置く。
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

      // ロケールによる揺れを避けるため、単純な文字列比較で昇順に並べる
      if (a.cwd === b.cwd) {
        return 0;
      }
      return a.cwd < b.cwd ? -1 : 1;
    });
};

/**
 * グループを描画順どおりに平坦化する。
 * 選択カーソルはこの配列への添字として扱うため、描画側と必ず同じ順序を使う。
 */
export const flattenGroups = (groups: readonly AgentGroup[]): Agent[] =>
  groups.flatMap((group) => [...group.agents]);
