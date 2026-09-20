// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '../../../../types/agent.js';
import { AgentList } from './index.js';

const HOME = '/Users/naoki';

const agent = (sessionId: string): Agent => ({
  sessionId,
  name: sessionId,
  cwd: '/tmp',
  kind: 'interactive',
  startedAt: 0,
  state: 'waiting',
  rawState: 'idle',
  pid: undefined,
  id: undefined,
});

afterEach(cleanup);

const setup = (overrides: Partial<Parameters<typeof AgentList>[0]> = {}) => {
  const onSelect = vi.fn();
  const onCopy = vi.fn();
  const result = render(
    <AgentList
      agents={[agent('a'), agent('b'), agent('c')]}
      frame={0}
      selectedIndex={1}
      now={0}
      selfSessionId={null}
      home={HOME}
      onSelect={onSelect}
      onCopy={onCopy}
      {...overrides}
    />,
  );
  return { ...result, onSelect, onCopy, user: userEvent.setup() };
};

describe('AgentList', () => {
  it('0 件なら EmptyState を出す', () => {
    setup({ agents: [] });
    expect(screen.getByText(/セッションはありません/)).toBeDefined();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('端末と違い件数を絞らず全件描画する', () => {
    setup({ agents: Array.from({ length: 30 }, (_, index) => agent(`s${index}`)) });
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

  it('クリックした行の位置を通知する', async () => {
    const { onSelect, user } = setup();
    await user.click(screen.getAllByRole('option')[2] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('ダブルクリックした行の位置を通知する', async () => {
    const { onCopy, user } = setup();
    await user.dblClick(screen.getAllByRole('option')[0] as HTMLElement);
    expect(onCopy).toHaveBeenCalledWith(0);
  });
});
