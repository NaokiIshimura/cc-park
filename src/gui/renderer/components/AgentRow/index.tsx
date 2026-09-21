import { memo } from 'react';
import type { Agent } from '../../../../types/agent.js';
import { getAppearance } from '../../../../shared/characters.js';
import {
  formatTokenCounts,
  formatTokenPercent,
  toFilledSegments,
  tokenUsageColor,
  TOKEN_BAR_SEGMENTS,
} from '../../../../shared/formatTokenUsage.js';
import { formatDuration } from '../../../../utils/formatDuration.js';
import { inkColor } from '../../colors.js';
import { Character } from '../Character/index.js';
import { StatusBadge } from '../StatusBadge/index.js';

/** プロンプト行の先頭に置く目印。TUI と揃える。 */
const PROMPT_MARKER = '>';

/**
 * プロンプト行の中身を組み立てる。
 * まだプロンプトが無いセッションでも行数を揃えるため、目印だけは残す。
 */
const promptLine = (lastPrompt: string | undefined): string =>
  lastPrompt === undefined ? PROMPT_MARKER : `${PROMPT_MARKER} ${lastPrompt}`;

interface AgentRowProps {
  readonly agent: Agent;
  readonly frame: number;
  readonly selected: boolean;
  /** 経過時間の算出基準時刻 */
  readonly now: number;
  /** 自分自身のセッションかどうか */
  readonly isSelf: boolean;
  /** 最終プロンプトを表示するか */
  readonly showPrompt: boolean;
  /** コンテキスト利用率を表示するか */
  readonly showTokens: boolean;
  readonly onSelect: () => void;
  readonly onCopy: () => void;
}

/**
 * 1 セッション分の行。キャラクター・名前・トークン・最終プロンプト・状態を表示する。
 *
 * cwd はグループ見出しへ移したので行には出さない。
 * 情報が 3 行に満たないときは下揃えになり、状態行が AA の足の行に並ぶ。
 */
const AgentRowComponent = ({
  agent,
  frame,
  selected,
  now,
  isSelf,
  showPrompt,
  showTokens,
  onSelect,
  onCopy,
}: AgentRowProps) => {
  const appearance = getAppearance(agent.state);
  const elapsed = agent.startedAt > 0 ? formatDuration(now - agent.startedAt) : '-';
  const detail =
    agent.state === 'unknown' && agent.rawState !== ''
      ? `${appearance.description} (${agent.rawState})`
      : appearance.description;

  const tokens = showTokens ? agent.meta?.tokens : undefined;
  const lastPrompt = showPrompt ? agent.meta?.lastPrompt : undefined;
  // バーは文字ではなく div で描く。`▰` / `▱` は SF Mono に無く桁が崩れるため
  const filled = tokens === undefined ? 0 : toFilledSegments(tokens.ratio);

  return (
    <li
      className={selected ? 'agent-row agent-row--selected' : 'agent-row'}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onDoubleClick={onCopy}
    >
      <Character state={agent.state} frame={frame} />

      {/*
        AA の 3 行と 1 対 1 で対応させる（名前 / プロンプト / 状態）。
        プロンプトが取れない場合は 2 行になり、下揃えで足の行に状態が来る。
      */}
      <div className="agent-row__info">
        <div className="agent-row__line">
          <span className="agent-row__name">{agent.name}</span>
          {agent.kind === 'background' ? <span className="tag tag--bg">[bg]</span> : null}
          {isSelf ? <span className="tag tag--self">[self]</span> : null}

          {tokens === undefined ? null : (
            <span
              className="token"
              style={{ color: inkColor(tokenUsageColor(tokens.ratio)) }}
              title={formatTokenCounts(tokens)}
            >
              <span className="token__bar" aria-hidden="true">
                {Array.from({ length: TOKEN_BAR_SEGMENTS }, (_, index) => (
                  <span
                    key={index}
                    className={
                      index < filled ? 'token__segment token__segment--on' : 'token__segment'
                    }
                  />
                ))}
              </span>
              <span className="token__percent">{formatTokenPercent(tokens.ratio)}</span>
            </span>
          )}
        </div>

        {showPrompt ? (
          <div className="agent-row__line">
            <span className="agent-row__prompt">{promptLine(lastPrompt)}</span>
          </div>
        ) : null}

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
