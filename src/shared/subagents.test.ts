import { describe, expect, it } from 'vitest';
import type { Agent, CharacterState, Subagent } from '../types/agent.js';
import { SUBAGENT_MAX_AGE_MS, visibleSubagentCount, visibleSubagents } from './subagents.js';

const NOW = Date.parse('2026-09-25T01:00:00.000Z');

const subagent = (toolUseId: string, startedAt: number | undefined = NOW): Subagent => ({
  toolUseId,
  type: 'general-purpose',
  description: '調査',
  startedAt,
});

const agent = (state: CharacterState, subagents: readonly Subagent[] | null): Agent => ({
  sessionId: 'a',
  name: 'alpha',
  cwd: '/tmp/x',
  kind: 'interactive',
  startedAt: 0,
  state,
  rawState: state,
  pid: undefined,
  id: undefined,
  meta: subagents === null ? undefined : { lastPrompt: undefined, tokens: undefined, subagents },
});

describe('visibleSubagents', () => {
  it('セッションが動いている間は実行中のサブエージェントを返す', () => {
    // 非同期サブエージェントは親が待機中でも走り続ける
    for (const state of ['working', 'waiting', 'blocked', 'justFinished'] as const) {
      expect(visibleSubagents(agent(state, [subagent('toolu_1')]), NOW)).toEqual([
        subagent('toolu_1'),
      ]);
    }
  });

  it('終了済み・判別不能のセッションでは返さない', () => {
    for (const state of ['done', 'stopped', 'unknown'] as const) {
      expect(visibleSubagents(agent(state, [subagent('toolu_1')]), NOW)).toEqual([]);
    }
  });

  it('起動から時間が経ちすぎたものは返さない', () => {
    // 完了通知を取りこぼしても出続けないようにするための足切り
    const stale = subagent('toolu_1', NOW - SUBAGENT_MAX_AGE_MS);
    expect(visibleSubagents(agent('working', [stale]), NOW)).toEqual([]);
  });

  it('足切りに掛からないものは残す', () => {
    const fresh = subagent('toolu_1', NOW - SUBAGENT_MAX_AGE_MS + 1);
    expect(visibleSubagents(agent('working', [fresh]), NOW)).toHaveLength(1);
  });

  it('起動時刻が取れないものは足切りしない', () => {
    // 判断できないものを消すと、かえって一切表示されなくなる
    expect(visibleSubagents(agent('working', [subagent('toolu_1', undefined)]), NOW)).toHaveLength(
      1,
    );
  });

  it('transcript を読んでいなければ空を返す', () => {
    expect(visibleSubagents(agent('working', null), NOW)).toEqual([]);
  });
});

describe('visibleSubagentCount', () => {
  it('表示する体数を返す', () => {
    expect(visibleSubagentCount(agent('working', [subagent('a'), subagent('b')]), NOW)).toBe(2);
  });

  it('終了済みのセッションは 0 を返す', () => {
    expect(visibleSubagentCount(agent('done', [subagent('a')]), NOW)).toBe(0);
  });
});
