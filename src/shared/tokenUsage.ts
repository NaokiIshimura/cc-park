import type { TokenUsage } from '../types/agent.js';

/**
 * transcript の assistant メッセージが持つ `usage` のうち、
 * コンテキストを占める項目だけを見る。出力トークンは次のリクエストの入力になるが、
 * その時点では `cache_creation` / `cache_read` に含まれるため二重に数えない。
 */
export interface RawUsage {
  readonly input_tokens?: unknown;
  readonly cache_creation_input_tokens?: unknown;
  readonly cache_read_input_tokens?: unknown;
}

/**
 * コンテキスト上限の候補。
 *
 * transcript には上限が記録されておらず、`model` も `claude-opus-5` のように
 * `[1m]` の有無が分からない形で入る。そのため実測値が収まる最小の段を上限とみなす。
 */
/** いちばん広いコンテキスト。どの段にも収まらない場合はこれを上限とみなす。 */
const MAX_CONTEXT_LIMIT = 1_000_000;

export const CONTEXT_LIMIT_TIERS: readonly number[] = [200_000, MAX_CONTEXT_LIMIT];

const toCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** コンテキストを占めているトークン数を合計する。数値が 1 つも無ければ null。 */
export const toUsedTokens = (usage: RawUsage): number | null => {
  const values = [
    usage.input_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_read_input_tokens,
  ];
  if (!values.some((value) => typeof value === 'number' && Number.isFinite(value))) {
    return null;
  }
  return values.reduce<number>((total, value) => total + toCount(value), 0);
};

/** 使用量が収まる最小の段を上限とする。明示指定があればそちらを優先する。 */
export const resolveContextLimit = (used: number, explicit?: number | undefined): number => {
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  return CONTEXT_LIMIT_TIERS.find((tier) => tier >= used) ?? MAX_CONTEXT_LIMIT;
};

/** `usage` から表示用のコンテキスト使用量を作る。数えられなければ undefined。 */
export const toTokenUsage = (
  usage: RawUsage,
  explicitLimit?: number | undefined,
): TokenUsage | undefined => {
  const used = toUsedTokens(usage);
  if (used === null) {
    return undefined;
  }

  const limit = resolveContextLimit(used, explicitLimit);
  return { used, limit, ratio: Math.min(used / limit, 1) };
};
