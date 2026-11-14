import { describe, expect, it } from 'vitest';
import type { Agent, CharacterState } from '../types/agent.js';
import {
  collapseGroups,
  filterAgents,
  formatCount,
  formatFilterLabel,
  isFiltering,
  matchesQuery,
  NO_FILTER,
  toggleCollapsed,
} from './filterAgents.js';

const agent = (sessionId: string, overrides: Partial<Agent> = {}): Agent => ({
  sessionId,
  name: sessionId,
  cwd: '/Users/naoki/GitHub/app',
  kind: 'interactive',
  startedAt: 0,
  state: 'waiting',
  rawState: 'idle',
  pid: undefined,
  id: undefined,
  meta: undefined,
  launchApp: undefined,
  ...overrides,
});

const withState = (state: CharacterState) => agent(state, { state });

describe('filterAgents', () => {
  const all = (
    ['working', 'blocked', 'justFinished', 'waiting', 'done', 'stopped', 'unknown'] as const
  ).map(withState);

  it('絞り込まなければそのまま返す', () => {
    expect(filterAgents(all, NO_FILTER)).toBe(all);
  });

  it('操作待ちだけなら、作業中と終わったものを隠す', () => {
    expect(
      filterAgents(all, { needsYouOnly: true, query: '' }).map((item) => item.state),
    ).toEqual(['blocked', 'justFinished', 'waiting', 'unknown']);
  });

  it('検索語と操作待ちの両方に当てはまるものだけを残す', () => {
    const agents = [
      agent('web', { state: 'waiting' }),
      agent('web-api', { state: 'working' }),
      agent('cli', { state: 'waiting' }),
    ];
    expect(
      filterAgents(agents, { needsYouOnly: true, query: 'web' }).map((item) => item.name),
    ).toEqual(['web']);
  });
});

describe('matchesQuery', () => {
  const target = agent('cc-park-bd', {
    cwd: '/Users/naoki/GitHub/cc-park',
    launchApp: 'iTerm2',
    meta: { lastPrompt: 'README を更新して', tokens: undefined, subagents: [] },
  });

  it.each(['CC-PARK', 'github/cc', 'readme', 'iterm'])('%s で見つかる', (query) => {
    expect(matchesQuery(target, query)).toBe(true);
  });

  it('空白で区切った語はすべて含むものだけを残す', () => {
    expect(matchesQuery(target, 'park readme')).toBe(true);
    expect(matchesQuery(target, 'park vscode')).toBe(false);
  });

  it('空の検索語はすべてに当てはまる', () => {
    expect(matchesQuery(target, '   ')).toBe(true);
  });
});

describe('collapseGroups / toggleCollapsed', () => {
  const groups = [
    { cwd: '/a', agents: [agent('a1'), agent('a2')] },
    { cwd: '/b', agents: [agent('b1')] },
  ];

  it('畳んだグループは中身を隠して件数だけ残す', () => {
    expect(collapseGroups(groups, new Set(['/a']))).toEqual([
      { cwd: '/a', agents: [], collapsed: true, hiddenCount: 2 },
      { ...groups[1], collapsed: false, hiddenCount: 0 },
    ]);
  });

  it('畳む / 開くを切り替える', () => {
    const once = toggleCollapsed(new Set(), '/a');
    expect(once.has('/a')).toBe(true);
    expect(toggleCollapsed(once, '/a').has('/a')).toBe(false);
  });
});

describe('表示用の整形', () => {
  it('絞り込んでいれば件数を 表示/全体 で出す', () => {
    expect(formatCount(5, 5)).toBe('5 sessions');
    expect(formatCount(2, 5)).toBe('2/5 sessions');
  });

  it('絞り込みの内容を見出し用にまとめる', () => {
    expect(formatFilterLabel(NO_FILTER)).toBe('');
    expect(formatFilterLabel({ needsYouOnly: true, query: '' })).toBe('[操作待ち]');
    expect(formatFilterLabel({ needsYouOnly: true, query: 'web' })).toBe('[操作待ち] /web');
  });

  it('空白だけの検索語は絞り込みとみなさない', () => {
    expect(isFiltering({ needsYouOnly: false, query: '  ' })).toBe(false);
  });
});
