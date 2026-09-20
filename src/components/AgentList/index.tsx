import { Box, Text } from 'ink';
import type { Agent } from '../../types/agent.js';
import { getAppearance } from '../Character/index.js';
import { AgentRow } from '../AgentRow/index.js';
import { EmptyState } from '../EmptyState/index.js';

interface AgentListProps {
  readonly agents: readonly Agent[];
  readonly frame: number;
  readonly selectedIndex: number;
  readonly now: number;
  readonly selfSessionId: string | null;
  /** 情報カラムに使える表示幅 */
  readonly infoWidth: number;
  /** 同時に表示できる最大件数。端末の高さから算出する */
  readonly maxVisible: number;
}

/** 1 セッションが占める行数（本体 2 行 + 行間 1 行） */
export const ROWS_PER_AGENT = 3;

export interface VisibleWindow {
  readonly start: number;
  readonly end: number;
}

/**
 * 端末に収まる件数だけを切り出す。選択行が必ず窓の中に入るようにする。
 * 全件収まる場合は全件を返す。
 */
export const computeWindow = (
  total: number,
  selectedIndex: number,
  maxVisible: number,
): VisibleWindow => {
  const size = Math.max(Math.min(maxVisible, total), 0);
  if (size === 0 || size === total) {
    return { start: 0, end: total };
  }

  // 選択行を中央に寄せつつ、両端で範囲外へはみ出さないよう丸める
  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(selectedIndex - half, total - size));
  return { start, end: start + size };
};

/**
 * 要対応のものが上に来るよう並べ替える。
 * 優先度が同じ場合は起動が新しい順にする。
 */
export const sortAgents = (agents: readonly Agent[]): Agent[] =>
  [...agents].sort((a, b) => {
    const diff = getAppearance(a.state).priority - getAppearance(b.state).priority;
    if (diff !== 0) {
      return diff;
    }
    return b.startedAt - a.startedAt;
  });

/** セッション一覧。0 件のときは EmptyState を出す。 */
export const AgentList = ({
  agents,
  frame,
  selectedIndex,
  now,
  selfSessionId,
  infoWidth,
  maxVisible,
}: AgentListProps) => {
  if (agents.length === 0) {
    return <EmptyState />;
  }

  const { start, end } = computeWindow(agents.length, selectedIndex, maxVisible);
  const hiddenAbove = start;
  const hiddenBelow = agents.length - end;

  return (
    <Box flexDirection="column" paddingY={1}>
      {hiddenAbove > 0 ? <Text dimColor>{`  ^ 他 ${hiddenAbove} 件`}</Text> : null}

      <Box flexDirection="column" gap={1}>
        {agents.slice(start, end).map((agent, index) => (
          <AgentRow
            key={agent.sessionId}
            agent={agent}
            frame={frame}
            selected={start + index === selectedIndex}
            now={now}
            isSelf={agent.sessionId === selfSessionId}
            infoWidth={infoWidth}
          />
        ))}
      </Box>

      {hiddenBelow > 0 ? <Text dimColor>{`  v 他 ${hiddenBelow} 件`}</Text> : null}
    </Box>
  );
};
