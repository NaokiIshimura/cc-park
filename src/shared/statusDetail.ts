import { getAppearance } from './characters.js';
import type { Agent, PendingTool } from '../types/agent.js';

/**
 * 状態行に出す説明。
 *
 * `BLOCKED` で何の承認を待っているかが分かれば、その内容（`Bash: npm test` など）を出す。
 * 承認しに行く前に、急ぐものかどうかを判断できるようにするため。
 */

/** 承認待ちの対象を `Bash: npm test` の形にする。引数が取れなければツール名だけ。 */
export const formatPendingTool = (tool: PendingTool): string =>
  tool.detail === '' ? tool.name : `${tool.name}: ${tool.detail}`;

/** 承認待ちの対象。`BLOCKED` でない・分からなければ undefined。 */
export const blockedReason = (agent: Pick<Agent, 'state' | 'meta'>): string | undefined => {
  const tool = agent.meta?.pendingTool;
  return agent.state === 'blocked' && tool !== undefined ? formatPendingTool(tool) : undefined;
};

/** 状態の説明。未知の状態は生の値を添え、承認待ちは対象が分かればそれに置き換える。 */
export const statusDetail = (agent: Pick<Agent, 'state' | 'rawState' | 'meta'>): string => {
  const reason = blockedReason(agent);
  if (reason !== undefined) {
    return reason;
  }
  const { description } = getAppearance(agent.state);
  return agent.state === 'unknown' && agent.rawState !== ''
    ? `${description} (${agent.rawState})`
    : description;
};
