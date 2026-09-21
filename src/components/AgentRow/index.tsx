import { Box, Text } from 'ink';
import { memo } from 'react';
import type { Agent } from '../../types/agent.js';
import { formatCwd, formatDuration } from '../../utils/index.js';
import { Character, getAppearance } from '../Character/index.js';
import { StatusBadge } from '../StatusBadge/index.js';

interface AgentRowProps {
  readonly agent: Agent;
  readonly frame: number;
  readonly selected: boolean;
  /** 経過時間の算出基準時刻 */
  readonly now: number;
  /** 自分自身のセッションかどうか */
  readonly isSelf: boolean;
  /** 情報カラムに使える表示幅 */
  readonly infoWidth: number;
}

/** 1 セッション分の行。キャラクター・名前・cwd・状態・経過時間を表示する。 */
const AgentRowComponent = ({
  agent,
  frame,
  selected,
  now,
  isSelf,
  infoWidth,
}: AgentRowProps) => {
  const appearance = getAppearance(agent.state);
  const elapsed = agent.startedAt > 0 ? formatDuration(now - agent.startedAt) : '-';
  const detail =
    agent.state === 'unknown' && agent.rawState !== ''
      ? `${appearance.description} (${agent.rawState})`
      : appearance.description;

  return (
    <Box flexDirection="row" gap={1}>
      <Text color="cyan">{selected ? '>' : ' '}</Text>

      <Box flexDirection="column" flexShrink={0}>
        <Character state={agent.state} frame={frame} bold={selected} />
      </Box>

      {/*
        Claude Code の起動バナーと同じ 3 行構成（名前 / 状態 / cwd）にして
        AA の 3 行と 1 対 1 で対応させる。
      */}
      <Box flexDirection="column" width={infoWidth}>
        {/*
          全角を含む名前でも行が折り返してキャラクターの枠が崩れないよう、
          1 行を 1 つの Text にまとめて Ink 側で表示幅どおりに切り詰めさせる。
        */}
        <Text wrap="truncate-end">
          <Text bold={selected} color={selected ? 'white' : 'gray'}>
            {agent.name}
          </Text>
          {agent.kind === 'background' ? <Text color="magenta"> [bg]</Text> : null}
          {isSelf ? <Text color="blueBright"> [self]</Text> : null}
        </Text>

        <Text wrap="truncate-end">
          <StatusBadge state={agent.state} />
          <Text dimColor>{` ${detail} ${elapsed}`}</Text>
        </Text>

        <Text wrap="truncate-end" dimColor>
          {formatCwd(agent.cwd)}
        </Text>
      </Box>
    </Box>
  );
};

/** 変化のない行を再描画しないようメモ化する。 */
export const AgentRow = memo(AgentRowComponent);
