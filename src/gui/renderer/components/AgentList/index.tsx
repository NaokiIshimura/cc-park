import type { Agent } from '../../../../types/agent.js';
import { formatCwd } from '../../../../shared/formatCwd.js';
import { UNKNOWN_CWD_LABEL, type AgentGroup } from '../../../../shared/groupAgents.js';
import { AgentRow } from '../AgentRow/index.js';
import { EmptyState } from '../EmptyState/index.js';

/** グループ見出しの cwd 表示に使う最大文字数。行内より広く取れる。 */
const CWD_MAX_WIDTH = 60;

interface AgentListProps {
  readonly groups: readonly AgentGroup[];
  readonly frame: number;
  readonly selectedIndex: number;
  readonly now: number;
  readonly selfSessionId: string | null;
  readonly home: string;
  /** 最終プロンプトを表示するか */
  readonly showPrompt: boolean;
  /** コンテキスト利用率を表示するか */
  readonly showTokens: boolean;
  readonly onSelect: (index: number) => void;
  readonly onCopy: (index: number) => void;
}

/** グループ見出しの表示文字列。cwd 不明はまとめて 1 つの見出しにする。 */
const headerLabel = (cwd: string, home: string): string =>
  cwd === '' ? UNKNOWN_CWD_LABEL : formatCwd(cwd, CWD_MAX_WIDTH, home);

/**
 * セッション一覧。0 件のときは EmptyState を出す。
 * 端末と違い高さの制約が無いため、表示件数は絞らず CSS でスクロールさせる。
 */
export const AgentList = ({
  groups,
  frame,
  selectedIndex,
  now,
  selfSessionId,
  home,
  showPrompt,
  showTokens,
  onSelect,
  onCopy,
}: AgentListProps) => {
  if (groups.length === 0) {
    return <EmptyState />;
  }

  // 選択カーソルはフラットな添字なので、描画しながら通し番号を振る
  let flatIndex = -1;

  return (
    <ul className="agent-list" role="listbox" aria-label="セッション一覧">
      {groups.map((group) => (
        <li key={group.cwd} className="agent-group" role="presentation">
          <h2 className="agent-group__header">{headerLabel(group.cwd, home)}</h2>

          <ul className="agent-group__items" role="presentation">
            {group.agents.map((agent: Agent) => {
              flatIndex += 1;
              const index = flatIndex;
              return (
                <AgentRow
                  key={agent.sessionId}
                  agent={agent}
                  frame={frame}
                  selected={index === selectedIndex}
                  now={now}
                  isSelf={agent.sessionId === selfSessionId}
                  showPrompt={showPrompt}
                  showTokens={showTokens}
                  onSelect={() => {
                    onSelect(index);
                  }}
                  onCopy={() => {
                    onCopy(index);
                  }}
                />
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
};
