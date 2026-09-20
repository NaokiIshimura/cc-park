import { memo } from 'react';
import type { Agent } from '../../../../types/agent.js';
import { getAppearance } from '../../../../shared/characters.js';
import { formatCwd } from '../../../../shared/formatCwd.js';
import { formatDuration } from '../../../../utils/formatDuration.js';
import { Character } from '../Character/index.js';
import { StatusBadge } from '../StatusBadge/index.js';

/** cwd の表示に使う最大文字数。TUI と揃える。 */
const CWD_MAX_WIDTH = 40;

interface AgentRowProps {
  readonly agent: Agent;
  readonly frame: number;
  readonly selected: boolean;
  /** 経過時間の算出基準時刻 */
  readonly now: number;
  /** 自分自身のセッションかどうか */
  readonly isSelf: boolean;
  /** `~` 短縮に使うホームディレクトリ */
  readonly home: string;
  readonly onSelect: () => void;
  readonly onCopy: () => void;
}

/** 1 セッション分の行。キャラクター・名前・cwd・状態・経過時間を表示する。 */
const AgentRowComponent = ({
  agent,
  frame,
  selected,
  now,
  isSelf,
  home,
  onSelect,
  onCopy,
}: AgentRowProps) => {
  const appearance = getAppearance(agent.state);
  const elapsed = agent.startedAt > 0 ? formatDuration(now - agent.startedAt) : '-';
  const detail =
    agent.state === 'unknown' && agent.rawState !== ''
      ? `${appearance.description} (${agent.rawState})`
      : appearance.description;

  return (
    <li
      className={selected ? 'agent-row agent-row--selected' : 'agent-row'}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onDoubleClick={onCopy}
    >
      <Character state={agent.state} frame={frame} />

      <div className="agent-row__info">
        <div className="agent-row__line">
          <span className="agent-row__name">{agent.name}</span>
          {agent.kind === 'background' ? <span className="tag tag--bg">[bg]</span> : null}
          {isSelf ? <span className="tag tag--self">[self]</span> : null}
          <span className="agent-row__cwd">{formatCwd(agent.cwd, CWD_MAX_WIDTH, home)}</span>
        </div>

        <div className="agent-row__line">
          <StatusBadge state={agent.state} />
          <span className="agent-row__detail">{`${detail} ${elapsed}`}</span>
        </div>
      </div>
    </li>
  );
};

/** 変化のない行を再描画しないようメモ化する。 */
export const AgentRow = memo(AgentRowComponent);
