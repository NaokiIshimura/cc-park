import type { Agent } from '../../../../types/agent.js';
import { AgentRow } from '../AgentRow/index.js';
import { EmptyState } from '../EmptyState/index.js';

interface AgentListProps {
  readonly agents: readonly Agent[];
  readonly frame: number;
  readonly selectedIndex: number;
  readonly now: number;
  readonly selfSessionId: string | null;
  readonly home: string;
  readonly onSelect: (index: number) => void;
  readonly onCopy: (index: number) => void;
}

/**
 * セッション一覧。0 件のときは EmptyState を出す。
 * 端末と違い高さの制約が無いため、表示件数は絞らず CSS でスクロールさせる。
 */
export const AgentList = ({
  agents,
  frame,
  selectedIndex,
  now,
  selfSessionId,
  home,
  onSelect,
  onCopy,
}: AgentListProps) => {
  if (agents.length === 0) {
    return <EmptyState />;
  }

  return (
    <ul className="agent-list" role="listbox" aria-label="セッション一覧">
      {agents.map((agent, index) => (
        <AgentRow
          key={agent.sessionId}
          agent={agent}
          frame={frame}
          selected={index === selectedIndex}
          now={now}
          isSelf={agent.sessionId === selfSessionId}
          home={home}
          onSelect={() => {
            onSelect(index);
          }}
          onCopy={() => {
            onCopy(index);
          }}
        />
      ))}
    </ul>
  );
};
