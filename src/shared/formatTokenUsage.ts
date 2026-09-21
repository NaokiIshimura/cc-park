import { CHARACTER_WIDTH } from './characters.js';
import type { TokenUsage } from '../types/agent.js';

/**
 * コンテキスト使用量の表示。
 *
 * バーに使う `█`（U+2588）/ `░`（U+2591）は AA と同じ Block Elements で、
 * Menlo / SF Mono の双方に収録され字送り幅が ASCII と同じことを確認済み。
 * `▰` / `▱` は SF Mono に無く桁が崩れるため使わない。
 */

/** バーのセグメント数。AA の幅に合わせて視覚的な単位を揃える。 */
export const TOKEN_BAR_SEGMENTS = CHARACTER_WIDTH - 1;

const FILLED = '█';
const EMPTY = '░';

/** 表示幅を固定するための桁数（`ctx 100%`）。 */
const PERCENT_TEXT_WIDTH = 8;

/** 使用率の警戒しきい値。 */
const WARN_RATIO = 0.7;
const DANGER_RATIO = 0.9;

/** `ctx` 表示が占める桁数（バー + 空白 + パーセント）。 */
export const TOKEN_TEXT_WIDTH = TOKEN_BAR_SEGMENTS + 1 + PERCENT_TEXT_WIDTH;

const clamp = (ratio: number): number => Math.min(Math.max(ratio, 0), 1);

/** 使用率をパーセント（0〜100 の整数）へ直す。 */
export const toPercent = (ratio: number): number => Math.round(clamp(ratio) * 100);

/**
 * 塗るセグメント数を求める。
 * 0% 以外は必ず 1 つ以上塗り、「使っているのに空に見える」状態を作らない。
 * TUI は文字、GUI は div で描くため、数だけを共有する。
 */
export const toFilledSegments = (ratio: number): number => {
  const exact = clamp(ratio) * TOKEN_BAR_SEGMENTS;
  return exact === 0 ? 0 : Math.max(Math.round(exact), 1);
};

/** 使用率をバーにする（TUI 用）。 */
export const formatTokenBar = (ratio: number): string => {
  const filled = toFilledSegments(ratio);
  return FILLED.repeat(filled) + EMPTY.repeat(TOKEN_BAR_SEGMENTS - filled);
};

/** 桁を揃えたパーセント表示（`ctx   7%` / `ctx 100%`）。 */
export const formatTokenPercent = (ratio: number): string =>
  `ctx ${String(toPercent(ratio)).padStart(3)}%`;

/** 使用率に応じた Ink の色名。GUI では colors.ts を通して CSS 変数へ読み替える。 */
export const tokenUsageColor = (ratio: number): string => {
  if (ratio >= DANGER_RATIO) {
    return 'red';
  }
  if (ratio >= WARN_RATIO) {
    return 'yellow';
  }
  return 'gray';
};

/** 実数値をツールチップ等で出すための文字列（`67k / 200k`）。 */
export const formatTokenCounts = (tokens: TokenUsage): string =>
  `${Math.round(tokens.used / 1000)}k / ${Math.round(tokens.limit / 1000)}k`;
