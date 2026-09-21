import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { Agent, CharacterState } from '../../types/agent.js';
import { AgentList, computeWindow, needsHeader, sortAgents } from './index.js';

const agent = (
  sessionId: string,
  state: CharacterState,
  startedAt = 0,
  cwd = '/tmp',
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

describe('sortAgents', () => {
  it('要対応の状態を上に並べる', () => {
    const sorted = sortAgents([
      agent('idle', 'waiting'),
      agent('done', 'done'),
      agent('busy', 'working'),
      agent('blocked', 'blocked'),
      agent('finished', 'justFinished'),
    ]);
    expect(sorted.map((item) => item.sessionId)).toEqual([
      'blocked',
      'finished',
      'busy',
      'idle',
      'done',
    ]);
  });

  it('同じ優先度なら起動が新しい順にする', () => {
    const sorted = sortAgents([agent('old', 'waiting', 100), agent('new', 'waiting', 200)]);
    expect(sorted.map((item) => item.sessionId)).toEqual(['new', 'old']);
  });

  it('元の配列を破壊しない', () => {
    const input = [agent('a', 'waiting'), agent('b', 'blocked')];
    sortAgents(input);
    expect(input.map((item) => item.sessionId)).toEqual(['a', 'b']);
  });

  it('未知の状態は最後に並ぶ', () => {
    const sorted = sortAgents([agent('unknown', 'unknown'), agent('stopped', 'stopped')]);
    expect(sorted.map((item) => item.sessionId)).toEqual(['stopped', 'unknown']);
  });
});

describe('computeWindow', () => {
  it('全件収まるならそのまま返す', () => {
    expect(computeWindow(3, 0, 10)).toEqual({ start: 0, end: 3 });
  });

  it('収まらないときは選択行を中央へ寄せる', () => {
    expect(computeWindow(10, 5, 3)).toEqual({ start: 4, end: 7 });
  });

  it('先頭側では 0 で止まる', () => {
    expect(computeWindow(10, 0, 3)).toEqual({ start: 0, end: 3 });
  });

  it('末尾側では末端で止まる', () => {
    expect(computeWindow(10, 9, 3)).toEqual({ start: 7, end: 10 });
  });

  it('選択行は必ず窓の中に入る', () => {
    for (let selected = 0; selected < 10; selected += 1) {
      const { start, end } = computeWindow(10, selected, 4);
      expect(selected).toBeGreaterThanOrEqual(start);
      expect(selected).toBeLessThan(end);
    }
  });

  it('maxVisible が 0 以下でも壊れない', () => {
    expect(computeWindow(5, 0, 0)).toEqual({ start: 0, end: 5 });
    expect(computeWindow(5, 0, -1)).toEqual({ start: 0, end: 5 });
  });

  it('0 件でも壊れない', () => {
    expect(computeWindow(0, 0, 3)).toEqual({ start: 0, end: 0 });
  });
});

describe('needsHeader', () => {
  const agents = [
    agent('a1', 'waiting', 0, '/tmp/a'),
    agent('a2', 'waiting', 0, '/tmp/a'),
    agent('b1', 'waiting', 0, '/tmp/b'),
  ];

  it('窓の先頭では必ず見出しを出す', () => {
    expect(needsHeader(agents, 1, 1)).toBe(true);
  });

  it('直前と同じ cwd なら見出しを出さない', () => {
    expect(needsHeader(agents, 1, 0)).toBe(false);
  });

  it('cwd が変わったら見出しを出す', () => {
    expect(needsHeader(agents, 2, 0)).toBe(true);
  });
});

describe('AgentList', () => {
  const renderList = (agents: readonly Agent[], selectedIndex = 0, maxVisible = 100) =>
    render(
      <AgentList
        agents={agents}
        frame={0}
        selectedIndex={selectedIndex}
        now={1000}
        selfSessionId={null}
        infoWidth={60}
        headerWidth={70}
        showPrompt={false}
        showTokens={false}
        maxVisible={maxVisible}
      />,
    ).lastFrame() ?? '';

  it('0 件のときは EmptyState を出す', () => {
    expect(renderList([])).toContain('稼働中の Claude Code セッションはありません');
  });

  it('全セッションを描画する', () => {
    const output = renderList([agent('alpha', 'working'), agent('beta', 'waiting')]);
    expect(output).toContain('alpha');
    expect(output).toContain('beta');
  });

  it('selectedIndex の行だけを選択状態にする', () => {
    const output = renderList([agent('alpha', 'working'), agent('beta', 'waiting')], 1);
    const lines = output.split('\n').filter((line) => line.includes('beta'));
    expect(lines[0]?.trimStart().startsWith('>')).toBe(true);
  });

  it('端末に収まらない分は隠して件数を示す', () => {
    const agents = Array.from({ length: 6 }, (_, index) => agent(`s${index}`, 'waiting'));
    const output = renderList(agents, 0, 2);
    expect(output).toContain('v 他 4 件');
    expect(output).toContain('s0');
    expect(output).not.toContain('s5');
  });

  it('下の方を選ぶと上側の隠れ件数を示す', () => {
    const agents = Array.from({ length: 6 }, (_, index) => agent(`s${index}`, 'waiting'));
    const output = renderList(agents, 5, 2);
    expect(output).toContain('^ 他 4 件');
    expect(output).toContain('s5');
    expect(output).not.toContain('s0');
  });

  it('全件収まるときは隠れ件数を出さない', () => {
    const agents = Array.from({ length: 3 }, (_, index) => agent(`s${index}`, 'waiting'));
    const output = renderList(agents, 0, 10);
    expect(output).not.toContain('他 ');
  });

  it('cwd ごとに見出しを 1 回だけ出す', () => {
    const output = renderList([
      agent('alpha', 'working', 0, '/tmp/a'),
      agent('beta', 'waiting', 0, '/tmp/a'),
      agent('gamma', 'waiting', 0, '/tmp/b'),
    ]);
    expect(output.match(/\/tmp\/a/g)).toHaveLength(1);
    expect(output.match(/\/tmp\/b/g)).toHaveLength(1);
  });

  it('cwd が空のグループは (不明) と表示する', () => {
    expect(renderList([agent('alpha', 'working', 0, '')])).toContain('(不明)');
  });

  it('窓の途中で切れても先頭に見出しを出す', () => {
    const agents = [
      agent('s0', 'waiting', 0, '/tmp/a'),
      agent('s1', 'waiting', 0, '/tmp/a'),
      agent('s2', 'waiting', 0, '/tmp/a'),
    ];
    // s2 だけが窓に入る位置でも、その上に見出しが出る
    const output = renderList(agents, 2, 1);
    expect(output).toContain('s2');
    expect(output).toContain('/tmp/a');
  });

  it('selfSessionId に一致する行へ [self] を付ける', () => {
    const output =
      render(
        <AgentList
          agents={[agent('alpha', 'working')]}
          frame={0}
          selectedIndex={0}
          now={1000}
          selfSessionId="alpha"
          infoWidth={60}
          headerWidth={70}
          showPrompt={false}
          showTokens={false}
          maxVisible={100}
        />,
      ).lastFrame() ?? '';
    expect(output).toContain('[self]');
  });
});
