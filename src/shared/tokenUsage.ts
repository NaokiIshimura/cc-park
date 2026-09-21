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
 * transcript に上限そのものは記録されていない。モデル ID が分かれば
 * そこから決められるが（`resolveContextLimit`）、取れなかった場合の保険として
 * 実測値が収まる最小の段を上限とみなす。
 */
/** いちばん広いコンテキスト。どの段にも収まらない場合はこれを上限とみなす。 */
const MAX_CONTEXT_LIMIT = 1_000_000;

export const CONTEXT_LIMIT_TIERS: readonly number[] = [200_000, MAX_CONTEXT_LIMIT];

/**
 * 1M コンテキストのモデル ID に付く接尾辞。
 *
 * `assistant` 行の `message.model` からは落ちてしまうが、transcript 先頭付近の
 * `attachment.identity.modelId` には `claude-opus-5[1m]` の形で残っている。
 */
const LONG_CONTEXT_SUFFIX = '[1m]';

/**
 * モデル ID からコンテキスト上限を引く。判断できなければ null。
 *
 * `[1m]` が付かないモデルを 200k と断定はしない。上限の異なるモデルが増えたときに
 * 黙って誤った値を出すより、使用量からの推定へ委ねる方が安全なため。
 */
export const contextLimitFromModelId = (modelId: string | undefined): number | null =>
  modelId !== undefined && modelId.endsWith(LONG_CONTEXT_SUFFIX) ? MAX_CONTEXT_LIMIT : null;

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

/**
 * コンテキスト上限を決める。
 *
 * 明示指定 > モデル ID から引いた値 > 使用量が収まる最小の段、の順に採る。
 * 段推定だけだと 1M のセッションでも 200k 未満のうちは 200k 扱いになり、
 * Claude Code 側の表示（16%）と食い違う（80%）ため、モデル ID を優先する。
 */
export const resolveContextLimit = (
  used: number,
  explicit?: number | undefined,
  modelId?: string | undefined,
): number => {
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  return (
    contextLimitFromModelId(modelId) ??
    CONTEXT_LIMIT_TIERS.find((tier) => tier >= used) ??
    MAX_CONTEXT_LIMIT
  );
};

/** `usage` から表示用のコンテキスト使用量を作る。数えられなければ undefined。 */
export const toTokenUsage = (
  usage: RawUsage,
  explicitLimit?: number | undefined,
  modelId?: string | undefined,
): TokenUsage | undefined => {
  const used = toUsedTokens(usage);
  if (used === null) {
    return undefined;
  }

  const limit = resolveContextLimit(used, explicitLimit, modelId);
  return { used, limit, ratio: Math.min(used / limit, 1) };
};
