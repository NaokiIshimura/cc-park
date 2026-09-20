// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '../../../../types/agent.js';
import { AgentRow } from './index.js';

const HOME = '/Users/naoki';
const NOW = 1_000_000;

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  sessionId: 'session-1',
  name: 'worker',
  cwd: `${HOME}/GitHub/app`,
  kind: 'interactive',
  startedAt: NOW - 60_000,
  state: 'working',
  rawState: 'busy',
  pid: 1,
  id: undefined,
  ...overrides,
});

afterEach(cleanup);

const setup = (overrides: Partial<Parameters<typeof AgentRow>[0]> = {}) => {
  const onSelect = vi.fn();
  const onCopy = vi.fn();
  const result = render(
    <AgentRow
      agent={agent()}
      frame={0}
      selected={false}
      now={NOW}
      isSelf={false}
      home={HOME}
      onSelect={onSelect}
      onCopy={onCopy}
      {...overrides}
    />,
  );
  return { ...result, onSelect, onCopy, user: userEvent.setup() };
};

describe('AgentRow', () => {
  it('セッション名を表示する', () => {
    setup();
    expect(screen.getByText('worker')).toBeDefined();
  });

  it('cwd をホーム短縮して表示する', () => {
    setup();
    expect(screen.getByText('~/GitHub/app')).toBeDefined();
  });

  it('状態ラベルと説明・経過時間を表示する', () => {
    setup();
    expect(screen.getByText('BUSY')).toBeDefined();
    expect(screen.getByText('working... 1m')).toBeDefined();
  });

  it('未知の状態では生の状態文字列を添える', () => {
    setup({ agent: agent({ state: 'unknown', rawState: 'weird' }) });
    expect(screen.getByText(/unknown state \(weird\)/)).toBeDefined();
  });

  it('起動時刻が無ければ経過時間を - にする', () => {
    setup({ agent: agent({ startedAt: 0 }) });
    expect(screen.getByText(/working\.\.\. -/)).toBeDefined();
  });

  it('background セッションには [bg] を付ける', () => {
    setup({ agent: agent({ kind: 'background' }) });
    expect(screen.getByText('[bg]')).toBeDefined();
  });

  it('interactive セッションには [bg] を付けない', () => {
    setup();
    expect(screen.queryByText('[bg]')).toBeNull();
  });

  it('自分自身のセッションには [self] を付ける', () => {
    setup({ isSelf: true });
    expect(screen.getByText('[self]')).toBeDefined();
  });

  it('自分以外には [self] を付けない', () => {
    setup();
    expect(screen.queryByText('[self]')).toBeNull();
  });

  it('選択中は選択済みとして扱われる', () => {
    setup({ selected: true });
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('true');
  });

  it('未選択なら選択済みにしない', () => {
    setup();
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('false');
  });

  it('クリックで選択する', async () => {
    const { onSelect, user } = setup();
    await user.click(screen.getByRole('option'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('ダブルクリックでコピーする', async () => {
    const { onCopy, user } = setup();
    await user.dblClick(screen.getByRole('option'));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});
