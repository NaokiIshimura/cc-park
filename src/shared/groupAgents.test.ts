import { describe, expect, it } from 'vitest';
import type { Agent, CharacterState } from '../types/agent.js';
import { flattenGroups, groupAgents, UNKNOWN_CWD_LABEL } from './groupAgents.js';

const agent = (
  sessionId: string,
  cwd: string,
  state: CharacterState = 'waiting',
  startedAt = 0,
): Agent => ({
  sessionId,
  name: sessionId,
  cwd,
  kind: 'interactive',
  startedAt,
  state,
  rawState: state,
  pid: undefined,
  id: undefined,
  meta: undefined,
});

const keys = (agents: readonly Agent[]) => agents.map((item) => item.sessionId);

describe('groupAgents', () => {
  it('cwd ごとにまとめる', () => {
    const groups = groupAgents([
      agent('a', '/tmp/x'),
      agent('b', '/tmp/y'),
      agent('c', '/tmp/x'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.cwd)).toEqual(['/tmp/x', '/tmp/y']);
    expect(keys(groups[0]?.agents ?? [])).toEqual(['a', 'c']);
  });

  it('グループは cwd の昇順に並べる', () => {
    const groups = groupAgents([
      agent('y', '/tmp/y'),
      agent('x', '/tmp/x'),
      agent('z', '/tmp/z'),
    ]);
    expect(groups.map((group) => group.cwd)).toEqual(['/tmp/x', '/tmp/y', '/tmp/z']);
  });

  it('親ディレクトリは配下のディレクトリより先に置く', () => {
    const groups = groupAgents([
      agent('child', '/Users/naoki/xxx'),
      agent('home', '/Users/naoki'),
      agent('sibling', '/Users/naoki/yyy'),
    ]);
    expect(groups.map((group) => group.cwd)).toEqual([
      '/Users/naoki',
      '/Users/naoki/xxx',
      '/Users/naoki/yyy',
    ]);
  });

  it('要対応のセッションを含んでいても cwd の昇順を崩さない', () => {
    const groups = groupAgents([
      agent('idle', '/tmp/x', 'waiting'),
      agent('blocked', '/tmp/y', 'blocked'),
    ]);
    expect(groups.map((group) => group.cwd)).toEqual(['/tmp/x', '/tmp/y']);
  });

  it('グループ内は従来どおり優先度順に並べる', () => {
    const groups = groupAgents([
      agent('idle', '/tmp/x', 'waiting'),
      agent('blocked', '/tmp/x', 'blocked'),
    ]);
    expect(keys(groups[0]?.agents ?? [])).toEqual(['blocked', 'idle']);
  });

  it('cwd が空のグループは内容によらず最後に置く', () => {
    const groups = groupAgents([
      agent('unknown', '', 'blocked'),
      agent('idle', '/tmp/x', 'waiting'),
    ]);
    expect(groups.map((group) => group.cwd)).toEqual(['/tmp/x', '']);
  });

  it('1 グループだけでも壊れない', () => {
    expect(groupAgents([agent('a', '/tmp/x')])).toHaveLength(1);
  });

  it('0 件なら空配列', () => {
    expect(groupAgents([])).toEqual([]);
  });

  it('元の配列を破壊しない', () => {
    const input = [agent('a', '/tmp/x', 'waiting'), agent('b', '/tmp/x', 'blocked')];
    groupAgents(input);
    expect(keys(input)).toEqual(['a', 'b']);
  });
});

describe('flattenGroups', () => {
  it('グループの並び順どおりに平坦化する', () => {
    const groups = groupAgents([
      agent('idle', '/tmp/x', 'waiting'),
      agent('blocked', '/tmp/y', 'blocked'),
      agent('done', '/tmp/y', 'done'),
    ]);
    expect(keys(flattenGroups(groups))).toEqual(['idle', 'blocked', 'done']);
  });

  it('件数はグループ化の前後で変わらない', () => {
    const agents = [agent('a', '/tmp/x'), agent('b', ''), agent('c', '/tmp/y')];
    expect(flattenGroups(groupAgents(agents))).toHaveLength(agents.length);
  });

  it('0 件なら空配列', () => {
    expect(flattenGroups([])).toEqual([]);
  });
});

describe('UNKNOWN_CWD_LABEL', () => {
  it('cwd 不明の見出しに使う文言', () => {
    expect(UNKNOWN_CWD_LABEL).toBe('(不明)');
  });
});
