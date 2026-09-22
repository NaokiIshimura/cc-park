import type { Agent, Subagent } from '../types/agent.js';

/**
 * 画面に出す実行中のサブエージェント。
 *
 * `working` のときしか返さない。transcript から「結果がまだ返っていない呼び出し」を
 * 実行中とみなしているため、セッションが異常終了して `tool_result` が書かれないまま
 * 終わると、待機中のセッションにミニキャラクターが出続けてしまう。
 * サブエージェントは親が動いている間しか走らないので、この絞り込みで取りこぼしは起きない。
 */
export const visibleSubagents = (agent: Agent): readonly Subagent[] =>
  agent.state === 'working' ? (agent.meta?.subagents ?? []) : [];

/** 画面に出すミニキャラクターの数。 */
export const visibleSubagentCount = (agent: Agent): number => visibleSubagents(agent).length;
