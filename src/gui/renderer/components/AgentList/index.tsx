import type { Agent } from '../../../../types/agent.js';
import { formatCwd } from '../../../../shared/formatCwd.js';
import type { DisplayGroup } from '../../../../shared/filterAgents.js';
import { UNKNOWN_CWD_LABEL } from '../../../../shared/groupAgents.js';
import {
  findScheduledLaunch,
  type ScheduledLaunch,
} from '../../../../shared/scheduledLaunch.js';
import { AgentRow } from '../AgentRow/index.js';
import { EmptyState } from '../EmptyState/index.js';

/** グループ見出しの cwd 表示に使う最大文字数。行内より広く取れる。 */
const CWD_MAX_WIDTH = 60;

interface AgentListProps {
  readonly groups: readonly DisplayGroup[];
  readonly frame: number;
  readonly selectedIndex: number;
  readonly now: number;
  readonly selfSessionId: string | null;
  /** 予約から起動したセッションの記録。該当する行に印を付ける */
  readonly scheduledLaunches: readonly ScheduledLaunch[];
  readonly home: string;
  /** 最終プロンプトを表示するか */
  readonly showPrompt: boolean;
  /** コンテキスト利用率を表示するか */
  readonly showTokens: boolean;
  /** 実行中のサブエージェントをミニキャラクターで表示するか */
  readonly showSubagents: boolean;
  readonly onSelect: (index: number) => void;
  readonly onOpen: (index: number) => void;
  /** 行の右クリック。その行の操作メニューを出す */
  readonly onContextMenu?: (index: number) => void;
  /** 見出しのクリックで、そのディレクトリを畳む / 開く */
  readonly onToggleGroup: (cwd: string) => void;
  /** 絞り込みが効いているか。0 件のときの案内を変える */
  readonly filtered?: boolean;
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
  scheduledLaunches,
  home,
  showPrompt,
  showTokens,
  showSubagents,
  onSelect,
  onOpen,
  onContextMenu,
  onToggleGroup,
  filtered = false,
}: AgentListProps) => {
  if (groups.length === 0) {
    return <EmptyState filtered={filtered} />;
  }

  // 選択カーソルはフラットな添字なので、描画しながら通し番号を振る
  let flatIndex = -1;

  return (
    <ul className="agent-list" role="listbox" aria-label="セッション一覧">
      {groups.map((group) => (
        <li key={group.cwd} className="agent-group" role="presentation">
          <h2 className="agent-group__header">
            {/* 見出しを押すと畳む。畳んでいる間は件数だけを出し、カーソルも止めない */}
            <button
              type="button"
              className="agent-group__toggle"
              aria-expanded={!group.collapsed}
              title={group.collapsed ? 'クリックで開く' : 'クリックで畳む'}
              onClick={() => {
                onToggleGroup(group.cwd);
              }}
            >
              <span className="agent-group__chevron" aria-hidden="true">
                {group.collapsed ? '▸' : '▾'}
              </span>
              <span className="agent-group__label">{headerLabel(group.cwd, home)}</span>
              {group.collapsed ? (
                <span className="agent-group__hidden">{`${group.hiddenCount} 件`}</span>
              ) : null}
            </button>
          </h2>

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
                  scheduledLaunch={findScheduledLaunch(agent, scheduledLaunches)}
                  showPrompt={showPrompt}
                  showTokens={showTokens}
                  showSubagents={showSubagents}
                  onSelect={() => {
                    onSelect(index);
                  }}
                  onOpen={() => {
                    onOpen(index);
                  }}
                  {...(onContextMenu === undefined
                    ? {}
                    : {
                        onContextMenu: () => {
                          onContextMenu(index);
                        },
                      })}
                />
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
};
