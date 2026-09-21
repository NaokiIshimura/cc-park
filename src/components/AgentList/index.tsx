import { Box, Text } from 'ink';
import type { Agent } from '../../types/agent.js';
import { UNKNOWN_CWD_LABEL } from '../../shared/groupAgents.js';
import { sortAgents } from '../../shared/sortAgents.js';
import { formatCwd } from '../../utils/index.js';
import { AgentRow } from '../AgentRow/index.js';
import { EmptyState } from '../EmptyState/index.js';

interface AgentListProps {
  /** `flattenGroups` で平坦化済みの一覧。cwd ごとにまとまっている前提 */
  readonly agents: readonly Agent[];
  readonly frame: number;
  readonly selectedIndex: number;
  readonly now: number;
  readonly selfSessionId: string | null;
  /** 情報カラムに使える表示幅 */
  readonly infoWidth: number;
  /** グループ見出しに使える表示幅 */
  readonly headerWidth: number;
  /** 最終プロンプトを表示するか */
  readonly showPrompt: boolean;
  /** コンテキスト利用率を表示するか */
  readonly showTokens: boolean;
  /** 同時に表示できる最大件数。端末の高さから算出する */
  readonly maxVisible: number;
}

/** 1 セッションが占める行数（本体 3 行 + 行間 1 行） */
export const ROWS_PER_AGENT = 4;

/** グループ見出しが占める行数（見出し 1 行 + 見出し下の空行 1 行） */
export const ROWS_PER_GROUP_HEADER = 2;

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
 * 見出しを出す位置を判定する。
 *
 * グループを入れ子の配列にすると窓の計算が複雑になるため、一覧はフラットのまま持ち、
 * 「直前の行と cwd が変わったところ」で見出しを差し込む。窓の途中で切れた場合も
 * 先頭には必ず見出しが出る。
 */
export const needsHeader = (
  agents: readonly Agent[],
  index: number,
  windowStart: number,
): boolean => index === windowStart || agents[index]?.cwd !== agents[index - 1]?.cwd;

// 既存の import 互換のため再輸出する
export { sortAgents };

/** セッション一覧。0 件のときは EmptyState を出す。 */
export const AgentList = ({
  agents,
  frame,
  selectedIndex,
  now,
  selfSessionId,
  infoWidth,
  headerWidth,
  showPrompt,
  showTokens,
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
        {agents.slice(start, end).map((agent, offset) => {
          const index = start + offset;
          return (
            <Box key={agent.sessionId} flexDirection="column">
              {needsHeader(agents, index, start) ? (
                <Box marginBottom={1}>
                  <Text bold color="cyan" wrap="truncate-end">
                    {agent.cwd === '' ? UNKNOWN_CWD_LABEL : formatCwd(agent.cwd, headerWidth)}
                  </Text>
                </Box>
              ) : null}

              <AgentRow
                agent={agent}
                frame={frame}
                selected={index === selectedIndex}
                now={now}
                isSelf={agent.sessionId === selfSessionId}
                infoWidth={infoWidth}
                showPrompt={showPrompt}
                showTokens={showTokens}
              />
            </Box>
          );
        })}
      </Box>

      {hiddenBelow > 0 ? <Text dimColor>{`  v 他 ${hiddenBelow} 件`}</Text> : null}
    </Box>
  );
};
