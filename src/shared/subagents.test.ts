import { describe, expect, it } from 'vitest';
import type { Agent, CharacterState, Subagent } from '../types/agent.js';
import { visibleSubagentCount, visibleSubagents } from './subagents.js';

const subagent = (toolUseId: string): Subagent => ({
  toolUseId,
  type: 'general-purpose',
  description: '調査',
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
  it('working なら実行中のサブエージェントを返す', () => {
    expect(visibleSubagents(agent('working', [subagent('toolu_1')]))).toEqual([
      subagent('toolu_1'),
    ]);
  });

  it('working 以外では返さない', () => {
    // 異常終了で tool_result が書かれないまま終わった場合に、
    // 待機中のセッションへミニキャラクターが出続けるのを防ぐ
    for (const state of ['waiting', 'blocked', 'justFinished', 'done', 'stopped'] as const) {
      expect(visibleSubagents(agent(state, [subagent('toolu_1')]))).toEqual([]);
    }
  });

  it('transcript を読んでいなければ空を返す', () => {
    expect(visibleSubagents(agent('working', null))).toEqual([]);
  });
});

describe('visibleSubagentCount', () => {
  it('表示する体数を返す', () => {
    expect(visibleSubagentCount(agent('working', [subagent('a'), subagent('b')]))).toBe(2);
  });

  it('working 以外は 0 を返す', () => {
    expect(visibleSubagentCount(agent('waiting', [subagent('a')]))).toBe(0);
  });
});
