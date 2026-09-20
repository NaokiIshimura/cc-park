import { describe, expect, it } from 'vitest';
import type { RawAgent } from '../types/agent.js';
import { normalizeAgent, normalizeAgents, toCharacterState } from './normalizeAgent.js';

describe('toCharacterState', () => {
  it.each([
    ['busy', 'working'],
    ['running', 'working'],
    ['queued', 'working'],
    ['idle', 'waiting'],
    ['blocked', 'blocked'],
    ['done', 'done'],
    ['completed', 'done'],
    ['stopped', 'stopped'],
    ['failed', 'stopped'],
    ['cancelled', 'stopped'],
  ])('%s を %s へ変換する', (raw, expected) => {
    expect(toCharacterState(raw)).toBe(expected);
  });

  it('大文字小文字を区別しない', () => {
    expect(toCharacterState('BUSY')).toBe('working');
  });

  it('未知の値は unknown へフォールバックする', () => {
    expect(toCharacterState('hibernating')).toBe('unknown');
  });
});

describe('normalizeAgent', () => {
  const interactive: RawAgent = {
    pid: 16460,
    cwd: '/Users/naoki/GitHub/claude-code-watcher',
    kind: 'interactive',
    startedAt: 1789918159032,
    sessionId: '40e18e35-610a-4623-a62e-084cac5ab466',
    name: 'claude-code-watcher-bd',
    status: 'busy',
  };

  const background: RawAgent = {
    id: '2160cf1c',
    cwd: '/Users/naoki',
    kind: 'background',
    startedAt: 1789881096899,
    sessionId: '2160cf1c-ca33-4853-b345-fbc356688e1f',
    name: 'claude agents setup',
    state: 'blocked',
  };

  it('interactive セッションを status から正規化する', () => {
    expect(normalizeAgent(interactive)).toEqual({
      sessionId: '40e18e35-610a-4623-a62e-084cac5ab466',
      name: 'claude-code-watcher-bd',
      cwd: '/Users/naoki/GitHub/claude-code-watcher',
      kind: 'interactive',
      startedAt: 1789918159032,
      state: 'working',
      rawState: 'busy',
      pid: 16460,
      id: undefined,
    });
  });

  it('background セッションを state から正規化する', () => {
    expect(normalizeAgent(background)).toMatchObject({
      kind: 'background',
      state: 'blocked',
      rawState: 'blocked',
      id: '2160cf1c',
      pid: undefined,
    });
  });

  it('未知の状態でも rawState を保持する', () => {
    const agent = normalizeAgent({ ...interactive, status: 'hibernating' });
    expect(agent?.state).toBe('unknown');
    expect(agent?.rawState).toBe('hibernating');
  });

  it('status と state の両方が欠けている場合は unknown になる', () => {
    const agent = normalizeAgent({ sessionId: 'abc', kind: 'interactive' });
    expect(agent?.state).toBe('unknown');
    expect(agent?.rawState).toBe('');
  });

  it('未知の kind は unknown になる', () => {
    expect(normalizeAgent({ sessionId: 'abc', kind: 'daemon' })?.kind).toBe('unknown');
  });

  it('name が無い場合は sessionId の先頭 8 文字で代替する', () => {
    expect(normalizeAgent({ sessionId: '40e18e35-610a' })?.name).toBe('40e18e35');
  });

  it('cwd と startedAt が無い場合は既定値で埋める', () => {
    const agent = normalizeAgent({ sessionId: 'abc' });
    expect(agent?.cwd).toBe('');
    expect(agent?.startedAt).toBe(0);
  });

  it('startedAt が数値でない場合は 0 にする', () => {
    const agent = normalizeAgent({ sessionId: 'abc', startedAt: '123' as unknown as number });
    expect(agent?.startedAt).toBe(0);
  });

  it('sessionId が無い要素は null を返す', () => {
    expect(normalizeAgent({ kind: 'interactive' })).toBeNull();
    expect(normalizeAgent({ sessionId: '' })).toBeNull();
    expect(normalizeAgent({ sessionId: 123 as unknown as string })).toBeNull();
  });
});

describe('normalizeAgents', () => {
  it('不正な要素を取り除く', () => {
    const agents = normalizeAgents([
      { sessionId: 'a', status: 'busy' },
      { kind: 'interactive' },
      { sessionId: 'b', state: 'done' },
    ]);
    expect(agents.map((agent) => agent.sessionId)).toEqual(['a', 'b']);
  });

  it('空配列を扱える', () => {
    expect(normalizeAgents([])).toEqual([]);
  });
});
