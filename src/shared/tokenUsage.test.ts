import { describe, expect, it } from 'vitest';
import { resolveContextLimit, toTokenUsage, toUsedTokens } from './tokenUsage.js';

describe('toUsedTokens', () => {
  it('コンテキストを占める 3 項目を合計する', () => {
    expect(
      toUsedTokens({
        input_tokens: 2,
        cache_creation_input_tokens: 604,
        cache_read_input_tokens: 66_095,
      }),
    ).toBe(66_701);
  });

  it('欠けている項目は 0 として扱う', () => {
    expect(toUsedTokens({ input_tokens: 10 })).toBe(10);
  });

  it('数値が 1 つも無ければ null', () => {
    expect(toUsedTokens({})).toBeNull();
    expect(toUsedTokens({ input_tokens: 'x' })).toBeNull();
  });

  it('負値は 0 として扱う', () => {
    expect(toUsedTokens({ input_tokens: 10, cache_read_input_tokens: -5 })).toBe(10);
  });

  it('有限な数値が 1 つも無ければ null', () => {
    expect(toUsedTokens({ input_tokens: Number.NaN })).toBeNull();
  });
});

describe('resolveContextLimit', () => {
  it('使用量が収まる最小の段を上限にする', () => {
    expect(resolveContextLimit(66_701)).toBe(200_000);
  });

  it('200k を超えていれば 1M 帯とみなす', () => {
    expect(resolveContextLimit(450_795)).toBe(1_000_000);
  });

  it('どの段にも収まらなければ最大の段にする', () => {
    expect(resolveContextLimit(2_000_000)).toBe(1_000_000);
  });

  it('明示指定があればそちらを優先する', () => {
    expect(resolveContextLimit(66_701, 500_000)).toBe(500_000);
  });

  it('明示指定が 0 以下や非数なら推定へ戻す', () => {
    expect(resolveContextLimit(100, 0)).toBe(200_000);
    expect(resolveContextLimit(100, Number.NaN)).toBe(200_000);
  });
});

describe('toTokenUsage', () => {
  it('使用量・上限・比率を返す', () => {
    expect(toTokenUsage({ input_tokens: 100_000 })).toEqual({
      used: 100_000,
      limit: 200_000,
      ratio: 0.5,
    });
  });

  it('数えられなければ undefined', () => {
    expect(toTokenUsage({})).toBeUndefined();
  });

  it('比率は 1 を超えない', () => {
    expect(toTokenUsage({ input_tokens: 3_000_000 })?.ratio).toBe(1);
  });

  it('上限を明示指定できる', () => {
    expect(toTokenUsage({ input_tokens: 50_000 }, 100_000)?.ratio).toBe(0.5);
  });
});
