import { Box, Text } from 'ink';
import { memo } from 'react';
import type { Agent } from '../../types/agent.js';
import {
  buildMiniRows,
  CHARACTER_HEIGHT,
  CHARACTER_WIDTH,
  miniPerRow,
} from '../../shared/characters.js';
import {
  formatTokenBar,
  formatTokenPercent,
  tokenUsageColor,
  TOKEN_TEXT_WIDTH,
} from '../../shared/formatTokenUsage.js';
import { visibleSubagentCount } from '../../shared/subagents.js';
import { formatDuration } from '../../utils/index.js';
import { Character, CHARACTERS, getAppearance } from '../Character/index.js';
import { StatusBadge } from '../StatusBadge/index.js';

/** プロンプト行の先頭に置く目印。選択カーソルとは列が離れるので同じ `>` を使う。 */
const PROMPT_MARKER = '>';

/**
 * プロンプト行の中身を組み立てる。
 * まだプロンプトが無いセッションでも行数を揃えるため、目印だけは残す。
 */
const promptLine = (lastPrompt: string | undefined): string =>
  lastPrompt === undefined ? PROMPT_MARKER : `${PROMPT_MARKER} ${lastPrompt}`;

/** トークン表示を出しても名前が潰れない最小の幅 */
const MIN_NAME_WIDTH = 12;

/**
 * ミニキャラクターが使える表示幅。
 *
 * AA の左端から始めて、情報カラムの右端まで横に並べる。
 * AA（9 桁）+ 情報カラムとの間の余白（1 桁）+ 情報カラム。
 */
const miniWidth = (infoWidth: number): number => CHARACTER_WIDTH + 1 + infoWidth;

/** AA の左端の位置（カーソル 1 桁 + 余白 1 桁）。 */
const MINI_INDENT = 2;

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
  /** 最終プロンプトを表示するか */
  readonly showPrompt: boolean;
  /** コンテキスト利用率を表示するか */
  readonly showTokens: boolean;
  /** 実行中のサブエージェントをミニキャラクターで表示するか */
  readonly showSubagents: boolean;
}

/**
 * 1 セッション分の行。キャラクター・名前・トークン・状態・最終プロンプトを表示する。
 *
 * cwd はグループ見出しへ移したので行には出さない。
 * 情報が 3 行に満たないときは下げて描き、最後の行が AA の足の行に並ぶ。
 * サブエージェントが走っている間は、AA の下に幅いっぱいのミニキャラクターの行が増える。
 */
const AgentRowComponent = ({
  agent,
  frame,
  selected,
  now,
  isSelf,
  infoWidth,
  showPrompt,
  showTokens,
  showSubagents,
}: AgentRowProps) => {
  const appearance = getAppearance(agent.state);
  const elapsed = agent.startedAt > 0 ? formatDuration(now - agent.startedAt) : '-';
  const detail =
    agent.state === 'unknown' && agent.rawState !== ''
      ? `${appearance.description} (${agent.rawState})`
      : appearance.description;

  const tokens = showTokens ? agent.meta?.tokens : undefined;
  const lastPrompt = showPrompt ? agent.meta?.lastPrompt : undefined;
  const subagents = showSubagents ? visibleSubagentCount(agent) : 0;
  const miniRows = buildMiniRows(subagents, frame, miniPerRow(miniWidth(infoWidth)));

  // 情報カラムは AA の 3 行に対して下揃えなので、カーソルも名前の行まで下げて揃える
  const infoLines = showPrompt ? 3 : 2;
  const cursorOffset = CHARACTER_HEIGHT - infoLines;

  // トークンは右端に固定し、余った幅を名前に割り当てる。狭いときは名前を優先する
  const tokenFits = tokens !== undefined && infoWidth >= MIN_NAME_WIDTH + TOKEN_TEXT_WIDTH + 1;
  const nameWidth = tokenFits ? infoWidth - TOKEN_TEXT_WIDTH - 1 : infoWidth;

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1} alignItems="flex-end">
        <Box flexShrink={0} alignSelf="flex-start" marginTop={cursorOffset}>
          <Text color="cyan">{selected ? '>' : ' '}</Text>
        </Box>

        <Box flexDirection="column" flexShrink={0}>
          <Character state={agent.state} frame={frame} bold={selected} />
        </Box>

        {/*
          AA の 3 行と 1 対 1 で対応させる（名前 / 状態 / プロンプト）。
          プロンプトが取れない場合は 2 行になり、下揃えで足の行に状態が来る。
        */}
        <Box flexDirection="column" width={infoWidth}>
          <Box flexDirection="row">
            {/*
              全角を含む名前でも行が折り返してキャラクターの枠が崩れないよう、
              1 行を 1 つの Text にまとめて Ink 側で表示幅どおりに切り詰めさせる。
            */}
            <Box width={nameWidth}>
              <Text wrap="truncate-end">
                <Text bold={selected} color={selected ? 'white' : 'gray'}>
                  {agent.name}
                </Text>
                {agent.kind === 'background' ? <Text color="magenta"> [bg]</Text> : null}
                {isSelf ? <Text color="blueBright"> [self]</Text> : null}
              </Text>
            </Box>

            {tokenFits && tokens !== undefined ? (
              <Text color={tokenUsageColor(tokens.ratio)}>
                {` ${formatTokenBar(tokens.ratio)} ${formatTokenPercent(tokens.ratio)}`}
              </Text>
            ) : null}
          </Box>

          {/*
            状態ラベルは左端に固定し、説明と経過時間は右端へ寄せる。
            1 行目のトークン表示と右端が揃い、行ごとの読み取りがしやすくなる。
          */}
          <Box flexDirection="row">
            <Box flexShrink={0}>
              <StatusBadge state={agent.state} />
            </Box>
            <Box flexGrow={1} justifyContent="flex-end">
              <Text wrap="truncate-end" dimColor>{`${detail} ${elapsed}`}</Text>
            </Box>
          </Box>

          {showPrompt ? (
            <Text wrap="truncate-end" dimColor>
              {promptLine(lastPrompt)}
            </Text>
          ) : null}
        </Box>
      </Box>

      {/*
        ミニキャラクターは AA の左端から、行の幅いっぱいまで横に並べる。
        入りきらずに折り返したときは、上下が繋がって見えないよう 1 行空ける。
      */}
      {miniRows.length > 0 ? (
        <Box flexDirection="column" marginLeft={MINI_INDENT} gap={1}>
          {miniRows.map((row, index) => (
            <Text key={index} color={CHARACTERS.working.color} bold={selected}>
              {row}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
};

/** 変化のない行を再描画しないようメモ化する。 */
export const AgentRow = memo(AgentRowComponent);
