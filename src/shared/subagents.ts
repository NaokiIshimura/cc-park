import type { Agent, CharacterState, Subagent } from '../types/agent.js';

/**
 * 画面に出す実行中のサブエージェント。
 *
 * 非同期サブエージェントは親がユーザーへ応答を返して待機している間も走り続けるため、
 * 親が `working` のときだけに絞ると、実行時間のほとんどで表示されなくなる
 * （実測では稼働 85 秒のうち 79 秒が親の待機中だった）。
 * そのため絞り込みは「セッションが終わっていないこと」と「起動からの経過時間」で行う。
 */

/** サブエージェントを表示するセッションの状態。終了済みと判別不能は対象から外す。 */
const LIVE_STATES: ReadonlySet<CharacterState> = new Set([
  'working',
  'justFinished',
  'waiting',
  'blocked',
]);

/**
 * 起動からこれを超えたサブエージェントは表示しない。
 *
 * 完了通知を取りこぼしたときにミニキャラクターが出続けないための保険。
 * 実測した稼働時間は 85〜215 秒だったので、余裕を見て 30 分とする。
 */
export const SUBAGENT_MAX_AGE_MS = 30 * 60 * 1000;

/** 起動が古すぎないか。起動時刻が取れないものは判断できないので通す。 */
const isFresh = (subagent: Subagent, now: number): boolean =>
  subagent.startedAt === undefined || now - subagent.startedAt < SUBAGENT_MAX_AGE_MS;

export const visibleSubagents = (agent: Agent, now: number): readonly Subagent[] => {
  if (!LIVE_STATES.has(agent.state)) {
    return [];
  }

  const subagents = agent.meta?.subagents ?? [];
  return subagents.filter((subagent) => isFresh(subagent, now));
};

/** 画面に出すミニキャラクターの数。 */
export const visibleSubagentCount = (agent: Agent, now: number): number =>
  visibleSubagents(agent, now).length;
