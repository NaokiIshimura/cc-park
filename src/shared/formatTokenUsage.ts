import { CHARACTER_WIDTH } from './characters.js';
import type { TokenUsage } from '../types/agent.js';

/**
 * コンテキスト使用量の表示。
 *
 * バーは renderer が div で描くので、ここでは塗るセグメント数と文言だけを決める。
 */

/** バーのセグメント数。AA の幅に合わせて視覚的な単位を揃える。 */
export const TOKEN_BAR_SEGMENTS = CHARACTER_WIDTH - 1;

/** 使用率の警戒しきい値。 */
const WARN_RATIO = 0.7;
const DANGER_RATIO = 0.9;

const clamp = (ratio: number): number => Math.min(Math.max(ratio, 0), 1);

/** 使用率をパーセント（0〜100 の整数）へ直す。 */
export const toPercent = (ratio: number): number => Math.round(clamp(ratio) * 100);

/**
 * 塗るセグメント数を求める。
 * 0% 以外は必ず 1 つ以上塗り、「使っているのに空に見える」状態を作らない。
 */
export const toFilledSegments = (ratio: number): number => {
  const exact = clamp(ratio) * TOKEN_BAR_SEGMENTS;
  return exact === 0 ? 0 : Math.max(Math.round(exact), 1);
};

/** 桁を揃えたパーセント表示（`ctx   7%` / `ctx 100%`）。 */
export const formatTokenPercent = (ratio: number): string =>
  `ctx ${String(toPercent(ratio)).padStart(3)}%`;

/** 使用率に応じた色名。renderer の colors.ts で CSS 変数へ読み替える。 */
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
