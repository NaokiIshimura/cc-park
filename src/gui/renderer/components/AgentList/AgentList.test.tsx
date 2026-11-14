// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '../../../../types/agent.js';
import { collapseGroups, type DisplayGroup } from '../../../../shared/filterAgents.js';
import type { AgentGroup } from '../../../../shared/groupAgents.js';
import { AgentList } from './index.js';

const HOME = '/Users/naoki';

const agent = (sessionId: string, cwd = '/tmp'): Agent => ({
  sessionId,
  name: sessionId,
  cwd,
  kind: 'interactive',
  startedAt: 0,
  state: 'waiting',
  rawState: 'idle',
  pid: undefined,
  id: undefined,
  meta: undefined,
  launchApp: undefined,
});

/** 1 グループに全員が入る、既定のグループ構成。 */
const oneGroup = (agents: readonly Agent[]): DisplayGroup[] =>
  open(agents.length === 0 ? [] : [{ cwd: agents[0]?.cwd ?? '', agents }]);

/** 畳んでいないグループとして表示用にする。 */
function open(groups: readonly AgentGroup[]): DisplayGroup[] {
  return collapseGroups(groups, new Set());
}

afterEach(cleanup);

const setup = (overrides: Partial<Parameters<typeof AgentList>[0]> = {}) => {
  const onSelect = vi.fn();
  const onOpen = vi.fn();
  const onToggleGroup = vi.fn();
  const result = render(
    <AgentList
      groups={oneGroup([agent('a'), agent('b'), agent('c')])}
      frame={0}
      selectedIndex={1}
      now={0}
      selfSessionId={null}
      scheduledLaunches={[]}
      home={HOME}
      showSubagents
      showPrompt={false}
      showTokens={false}
      onSelect={onSelect}
      onOpen={onOpen}
      onToggleGroup={onToggleGroup}
      {...overrides}
    />,
  );
  return { ...result, onSelect, onOpen, onToggleGroup, user: userEvent.setup() };
};

describe('AgentList', () => {
  it('0 件なら EmptyState を出す', () => {
    setup({ groups: [] });
    expect(screen.getByText(/セッションはありません/)).toBeDefined();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('端末と違い件数を絞らず全件描画する', () => {
    setup({ groups: oneGroup(Array.from({ length: 30 }, (_, index) => agent(`s${index}`))) });
    expect(screen.getAllByRole('option')).toHaveLength(30);
  });

  it('選択中の行だけを選択済みにする', () => {
    setup();
    const selected = screen.getAllByRole('option').filter(
      (option) => option.getAttribute('aria-selected') === 'true',
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain('b');
  });

  it('自分自身のセッションに [self] を付ける', () => {
    setup({ selfSessionId: 'c' });
    expect(screen.getByText('[self]')).toBeDefined();
  });

  it('予約から起動したセッションの行にだけ [sched] を付ける', () => {
    setup({
      groups: oneGroup([
        { ...agent('bf96c05e-48ae'), kind: 'background', id: 'bf96c05e' },
        agent('b'),
      ]),
      scheduledLaunches: [{ agentId: 'bf96c05e', scheduleId: 's1', time: '09:00', firedAt: 0 }],
    });
    expect(screen.getAllByText('[sched]')).toHaveLength(1);
  });

  it('クリックした行の位置を通知する', async () => {
    const { onSelect, user } = setup();
    await user.click(screen.getAllByRole('option')[2] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('ダブルクリックした行の位置を通知する', async () => {
    const { onOpen, user } = setup();
    await user.dblClick(screen.getAllByRole('option')[0] as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith(0);
  });
});

describe('AgentList のグループ表示', () => {
  const rawGroups: AgentGroup[] = [
    { cwd: `${HOME}/GitHub/app`, agents: [agent('a', `${HOME}/GitHub/app`)] },
    { cwd: '/tmp/work', agents: [agent('b', '/tmp/work'), agent('c', '/tmp/work')] },
  ];
  const twoGroups = open(rawGroups);

  it('cwd ごとに見出しを 1 回だけ出す', () => {
    setup({ groups: twoGroups });
    expect(screen.getByText('~/GitHub/app')).toBeDefined();
    expect(screen.getByText('/tmp/work')).toBeDefined();
  });

  it('cwd が空のグループは (不明) と表示する', () => {
    setup({ groups: open([{ cwd: '', agents: [agent('a', '')] }]) });
    expect(screen.getByText('(不明)')).toBeDefined();
  });

  it('見出しは選択肢に数えない', () => {
    setup({ groups: twoGroups });
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('グループをまたいで通し番号で位置を通知する', async () => {
    const { onSelect, user } = setup({ groups: twoGroups });
    await user.click(screen.getAllByRole('option')[2] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('見出しを押すとそのディレクトリを畳む / 開くよう伝える', async () => {
    const { onToggleGroup, user } = setup({ groups: twoGroups });
    await user.click(screen.getByRole('button', { name: /\/tmp\/work/ }));
    expect(onToggleGroup).toHaveBeenCalledWith('/tmp/work');
  });

  it('畳んだグループは件数だけを出し、行は出さない', () => {
    setup({ groups: collapseGroups(rawGroups, new Set(['/tmp/work'])) });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('2 件')).toBeDefined();
    expect(
      screen.getByRole('button', { name: /\/tmp\/work/ }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('絞り込みで 0 件なら、解除の仕方を案内する', () => {
    setup({ groups: [], filtered: true });
    expect(screen.getByText('条件に合うセッションはありません。')).toBeDefined();
  });
});
