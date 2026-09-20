import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchAgentsResult } from './core/fetchAgents.js';
import type { Agent } from './types/agent.js';

const fetchAgentsMock = vi.hoisted(() => vi.fn());

vi.mock('./core/fetchAgents.js', () => ({ fetchAgents: fetchAgentsMock }));

import type { AppProps } from './App.js';

const { App, computeMaxVisible } = await import('./App.js');

const wait = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  sessionId: 'session-a',
  name: 'cc-park',
  cwd: '/tmp/app',
  kind: 'interactive',
  startedAt: Date.now() - 60_000,
  state: 'working',
  rawState: 'busy',
  pid: 1,
  id: undefined,
  ...overrides,
});

const defaultProps: AppProps = {
  intervalMs: 10_000,
  all: false,
  cwd: undefined,
  notify: false,
  highlightMs: 10_000,
  interactive: false,
  selfSessionId: null,
  platform: 'darwin' as NodeJS.Platform,
};

const renderApp = async (props: Partial<AppProps> = {}) => {
  const instance = render(<App {...defaultProps} {...props} />);
  await wait();
  return instance;
};

describe('App', () => {
  beforeEach(() => {
    fetchAgentsMock.mockReset();
    fetchAgentsMock.mockResolvedValue({ ok: true, agents: [] } satisfies FetchAgentsResult);
  });

  it('ヘッダを表示する', async () => {
    const { lastFrame, unmount } = await renderApp();
    expect(lastFrame()).toContain('cc-park');
    unmount();
  });

  it('セッションを一覧表示する', async () => {
    fetchAgentsMock.mockResolvedValue({
      ok: true,
      agents: [agent(), agent({ sessionId: 'session-b', name: 'other', state: 'waiting' })],
    } satisfies FetchAgentsResult);

    const { lastFrame, unmount } = await renderApp();
    const output = lastFrame() ?? '';
    expect(output).toContain('cc-park');
    expect(output).toContain('other');
    expect(output).toContain('2 sessions');
    unmount();
  });

  it('要対応のセッションを先頭に並べる', async () => {
    fetchAgentsMock.mockResolvedValue({
      ok: true,
      agents: [
        agent({ sessionId: 'a', name: 'idle-one', state: 'waiting' }),
        agent({ sessionId: 'b', name: 'blocked-one', state: 'blocked' }),
      ],
    } satisfies FetchAgentsResult);

    const { lastFrame, unmount } = await renderApp();
    const output = lastFrame() ?? '';
    expect(output.indexOf('blocked-one')).toBeLessThan(output.indexOf('idle-one'));
    unmount();
  });

  it('0 件なら EmptyState を表示する', async () => {
    const { lastFrame, unmount } = await renderApp();
    expect(lastFrame()).toContain('稼働中の Claude Code セッションはありません');
    unmount();
  });

  it('取得に失敗したらエラーを表示する', async () => {
    fetchAgentsMock.mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', message: 'claude が見つかりません' },
    } satisfies FetchAgentsResult);

    const { lastFrame, unmount } = await renderApp();
    const output = lastFrame() ?? '';
    expect(output).toContain('取得できませんでした');
    expect(output).toContain('claude が見つかりません');
    unmount();
  });

  it('非インタラクティブではフッタを表示しない', async () => {
    const { lastFrame, unmount } = await renderApp();
    expect(lastFrame()).not.toContain('q 終了');
    unmount();
  });

  it('インタラクティブではフッタを表示する', async () => {
    const { lastFrame, unmount } = await renderApp({ interactive: true });
    expect(lastFrame()).toContain('q 終了');
    unmount();
  });

  it('notify 指定で通知 ON になる', async () => {
    const { lastFrame, unmount } = await renderApp({ notify: true });
    expect(lastFrame()).toContain('notify:ON');
    unmount();
  });

  it('macOS 以外では notify 指定でも通知 OFF になる', async () => {
    const { lastFrame, unmount } = await renderApp({ notify: true, platform: 'linux' });
    expect(lastFrame()).toContain('notify:off');
    unmount();
  });

  it('n キーで通知をトグルできる', async () => {
    const { stdin, lastFrame, unmount } = await renderApp({ notify: true, interactive: true });
    expect(lastFrame()).toContain('notify:ON');

    stdin.write('n');
    await wait();
    expect(lastFrame()).toContain('notify:off');
    unmount();
  });

  it('n キーで切り替えた結果をフッタのメッセージで知らせる', async () => {
    const { stdin, lastFrame, unmount } = await renderApp({ notify: true, interactive: true });

    stdin.write('n');
    await wait();
    expect(lastFrame()).toContain('OS 通知を OFF にしました');

    stdin.write('n');
    await wait();
    expect(lastFrame()).toContain('OS 通知を ON にしました');
    unmount();
  });

  it('macOS 以外では n キーで切り替えられないことを知らせる', async () => {
    const { stdin, lastFrame, unmount } = await renderApp({
      notify: true,
      interactive: true,
      platform: 'linux',
    });

    stdin.write('n');
    await wait();
    expect(lastFrame()).toContain('OS 通知は macOS のみ対応しています');
    expect(lastFrame()).toContain('notify:off');
    unmount();
  });

  it('selfSessionId に一致する行へ [self] を付ける', async () => {
    fetchAgentsMock.mockResolvedValue({
      ok: true,
      agents: [agent()],
    } satisfies FetchAgentsResult);

    const { lastFrame, unmount } = await renderApp({ selfSessionId: 'session-a' });
    expect(lastFrame()).toContain('[self]');
    unmount();
  });

  it('all と cwd を取得処理へ渡す', async () => {
    const { unmount } = await renderApp({ all: true, cwd: '/tmp/x' });
    expect(fetchAgentsMock.mock.calls[0]?.[0]).toMatchObject({ all: true, cwd: '/tmp/x' });
    unmount();
  });
});

describe('computeMaxVisible', () => {
  it('高さから表示件数を求める', () => {
    // 40 行 - chrome 8 行 = 32 行 → floor((32+1)/3) = 11 件
    expect(computeMaxVisible(40)).toBe(11);
  });

  it('端末が低くても最低 1 件は出す', () => {
    expect(computeMaxVisible(10)).toBe(1);
    expect(computeMaxVisible(0)).toBe(1);
  });

  it('chrome の行数を差し替えられる', () => {
    expect(computeMaxVisible(20, 2)).toBe(6);
  });

  it('高さが増えるほど件数も増える', () => {
    expect(computeMaxVisible(60)).toBeGreaterThan(computeMaxVisible(30));
  });
});
