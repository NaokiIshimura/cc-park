import type { Agent, CharacterState } from '../types/agent.js';
import type { AgentGroup } from './groupAgents.js';

/**
 * 一覧の絞り込み。
 *
 * セッションが多いと、見たいものを探すのにスクロールが要る。
 * 「操作待ちだけ」「文字列で検索」「ディレクトリを畳む」で表示を減らす。
 * 選択カーソルは絞り込んだ後の並びへの添字になるので、描画と選択の双方が同じ結果を使うこと。
 */

/**
 * 「操作待ちだけ」で残す状態。こちらの入力や判断を待っているもの。
 * 作業中（`working`）と、終わったもの（`done` / `stopped`）は隠す。何が起きているか分からない
 * `unknown` は、隠すと気づけなくなるので残す。
 */
const NEEDS_YOU_STATES: ReadonlySet<CharacterState> = new Set([
  'blocked',
  'justFinished',
  'waiting',
  'unknown',
]);

export interface AgentFilter {
  /** 操作待ちのセッションだけを表示する */
  readonly needsYouOnly: boolean;
  /** 検索語。空文字なら絞らない */
  readonly query: string;
}

export const NO_FILTER: AgentFilter = { needsYouOnly: false, query: '' };

/** 絞り込みが効いているか。 */
export const isFiltering = (filter: AgentFilter): boolean =>
  filter.needsYouOnly || filter.query.trim() !== '';

/**
 * 検索語に当てはまるか。名前・作業ディレクトリ・最終プロンプト・起動元アプリを、
 * 大文字小文字を区別せずに部分一致で探す。空白で区切った語はすべて含むものだけを残す。
 */
export const matchesQuery = (agent: Agent, query: string): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) {
    return true;
  }
  const haystack = [agent.name, agent.cwd, agent.meta?.lastPrompt ?? '', agent.launchApp ?? '']
    .join('\n')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
};

/** 絞り込みを適用する。並び順は変えない。 */
export const filterAgents = (agents: readonly Agent[], filter: AgentFilter): readonly Agent[] => {
  if (!isFiltering(filter)) {
    return agents;
  }
  return agents.filter(
    (agent) =>
      (!filter.needsYouOnly || NEEDS_YOU_STATES.has(agent.state)) &&
      matchesQuery(agent, filter.query),
  );
};

/** 畳んだグループ。見出しは残し、中のセッションの数だけ見せる。 */
export interface DisplayGroup extends AgentGroup {
  /** 畳んでいるか。畳んでいれば `agents` は空で、`hiddenCount` に件数が入る */
  readonly collapsed: boolean;
  readonly hiddenCount: number;
}

/**
 * 畳んだグループの中身を隠す。
 * 選択カーソルは隠したセッションに止まらないよう、平坦化する前にこれを通す。
 */
export const collapseGroups = (
  groups: readonly AgentGroup[],
  collapsed: ReadonlySet<string>,
): DisplayGroup[] =>
  groups.map((group) =>
    collapsed.has(group.cwd)
      ? { cwd: group.cwd, agents: [], collapsed: true, hiddenCount: group.agents.length }
      : { ...group, collapsed: false, hiddenCount: 0 },
  );

/** 畳む / 開くを切り替えた後の集合を返す。 */
export const toggleCollapsed = (
  collapsed: ReadonlySet<string>,
  cwd: string,
): ReadonlySet<string> => {
  const next = new Set(collapsed);
  if (next.has(cwd)) {
    next.delete(cwd);
  } else {
    next.add(cwd);
  }
  return next;
};

/** 絞り込んだときに見出しへ出す件数（`2/5 sessions`）。 */
export const formatCount = (shown: number, total: number): string =>
  shown === total ? `${total} sessions` : `${shown}/${total} sessions`;

/** 見出しに出す絞り込みの内容（`[操作待ち] /foo`）。絞り込んでいなければ空文字。 */
export const formatFilterLabel = (filter: AgentFilter): string =>
  [filter.needsYouOnly ? '[操作待ち]' : '', filter.query.trim() === '' ? '' : `/${filter.query}`]
    .filter((part) => part !== '')
    .join(' ');
