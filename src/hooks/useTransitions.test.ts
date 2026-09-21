import { describe, expect, it } from 'vitest';
import type { Agent, CharacterState, TransitionEvent } from '../types/agent.js';
import { applyJustFinished, nextFinishedUntil } from './useTransitions.js';

const agent = (sessionId: string, state: CharacterState): Agent => ({
  sessionId,
  name: sessionId,
  cwd: '/tmp',
  kind: 'interactive',
  startedAt: 0,
  state,
  rawState: state,
  pid: undefined,
  id: undefined,
  meta: undefined,
});

describe('applyJustFinished', () => {
  it('期限内の waiting を justFinished へ差し替える', () => {
    const result = applyJustFinished([agent('a', 'waiting')], new Map([['a', 1000]]), 500);
    expect(result[0]?.state).toBe('justFinished');
  });

  it('期限を過ぎたら waiting のままにする', () => {
    const result = applyJustFinished([agent('a', 'waiting')], new Map([['a', 1000]]), 1000);
    expect(result[0]?.state).toBe('waiting');
  });

  it('記録が無いセッションは変更しない', () => {
    const input = [agent('a', 'waiting')];
    expect(applyJustFinished(input, new Map(), 0)[0]).toBe(input[0]);
  });

  it('waiting 以外の状態は差し替えない', () => {
    const result = applyJustFinished([agent('a', 'working')], new Map([['a', 1000]]), 500);
    expect(result[0]?.state).toBe('working');
  });

  it('元のオブジェクトを破壊しない', () => {
    const input = agent('a', 'waiting');
    applyJustFinished([input], new Map([['a', 1000]]), 500);
    expect(input.state).toBe('waiting');
  });

  it('複数セッションのうち対象だけを差し替える', () => {
    const result = applyJustFinished(
      [agent('a', 'waiting'), agent('b', 'waiting')],
      new Map([['a', 1000]]),
      500,
    );
    expect(result.map((item) => item.state)).toEqual(['justFinished', 'waiting']);
  });

  it('空配列を扱える', () => {
    expect(applyJustFinished([], new Map(), 0)).toEqual([]);
  });
});

describe('nextFinishedUntil', () => {
  const event = (
    sessionId: string,
    from: CharacterState | null,
    to: CharacterState,
  ): TransitionEvent => ({ sessionId, name: sessionId, from, to, at: 0 });

  it('working -> waiting で期限を登録する', () => {
    const result = nextFinishedUntil(
      new Map(),
      [event('a', 'working', 'waiting')],
      [agent('a', 'waiting')],
      1000,
      500,
    );
    expect(result.get('a')).toBe(1500);
  });

  it('waiting 以外への遷移で記録を消す', () => {
    const result = nextFinishedUntil(
      new Map([['a', 1500]]),
      [event('a', 'waiting', 'working')],
      [agent('a', 'working')],
      1000,
      500,
    );
    expect(result.has('a')).toBe(false);
  });

  it('消滅したセッションの記録を消す', () => {
    const result = nextFinishedUntil(new Map([['a', 1500]]), [], [], 1000, 500);
    expect(result.size).toBe(0);
  });

  it('変化が無ければ同じ参照を返す', () => {
    const current = new Map([['a', 1500]]);
    expect(nextFinishedUntil(current, [], [agent('a', 'waiting')], 1000, 500)).toBe(current);
  });

  it('期限が更新されたら別の参照を返す', () => {
    const current = new Map([['a', 1500]]);
    const result = nextFinishedUntil(
      current,
      [event('a', 'working', 'waiting')],
      [agent('a', 'waiting')],
      1000,
      900,
    );
    expect(result).not.toBe(current);
    expect(result.get('a')).toBe(1900);
  });

  it('新規出現（from が null）の waiting では登録しない', () => {
    const result = nextFinishedUntil(
      new Map(),
      [event('a', null, 'waiting')],
      [agent('a', 'waiting')],
      1000,
      500,
    );
    expect(result.size).toBe(0);
  });
});
