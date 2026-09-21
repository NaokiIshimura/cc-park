import { describe, expect, it } from 'vitest';
import type { Agent, CharacterState } from '../types/agent.js';
import { diffAgents } from './diffAgents.js';

const agent = (sessionId: string, state: CharacterState): Agent => ({
  sessionId,
  name: `name-${sessionId}`,
  cwd: '/Users/naoki',
  kind: 'interactive',
  startedAt: 0,
  state,
  rawState: state,
  pid: undefined,
  id: undefined,
  meta: undefined,
});

describe('diffAgents', () => {
  it('初回（previous が null）は通知洪水を防ぐため空配列を返す', () => {
    expect(diffAgents(null, [agent('a', 'working')], 100)).toEqual([]);
  });

  it('状態が変化したセッションを返す', () => {
    const events = diffAgents([agent('a', 'working')], [agent('a', 'waiting')], 100);
    expect(events).toEqual([
      { sessionId: 'a', name: 'name-a', from: 'working', to: 'waiting', at: 100 },
    ]);
  });

  it('状態が変化していなければ何も返さない', () => {
    expect(diffAgents([agent('a', 'working')], [agent('a', 'working')], 100)).toEqual([]);
  });

  it('新規出現したセッションは from が null になる', () => {
    const events = diffAgents([], [agent('a', 'blocked')], 100);
    expect(events).toEqual([
      { sessionId: 'a', name: 'name-a', from: null, to: 'blocked', at: 100 },
    ]);
  });

  it('消滅したセッションはイベントにしない', () => {
    expect(diffAgents([agent('a', 'working')], [], 100)).toEqual([]);
  });

  it('複数セッションの遷移を同時に扱える', () => {
    const events = diffAgents(
      [agent('a', 'working'), agent('b', 'working')],
      [agent('a', 'waiting'), agent('b', 'working'), agent('c', 'done')],
      100,
    );
    expect(events.map((event) => [event.sessionId, event.from, event.to])).toEqual([
      ['a', 'working', 'waiting'],
      ['c', null, 'done'],
    ]);
  });
});
