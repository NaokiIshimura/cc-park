// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchAgentsResult } from '../../core/fetchAgents.js';
import type { ScheduleFiredEvent } from '../../core/scheduler.js';
import type { Schedule } from '../../shared/schedule.js';
import type { Agent } from '../../types/agent.js';
import { DEFAULT_ALWAYS_ON_TOP, type GuiConfig } from '../config.js';
import type { CcParkBridge } from '../ipc.js';
import { GuiApp } from './GuiApp.js';

const HOME = '/Users/naoki';

const config: GuiConfig = {
  intervalMs: 10_000,
  all: false,
  cwd: undefined,
  notify: true,
  highlightMs: 10_000,
  selfSessionId: null,
  subagents: false,
  home: HOME,
  platform: 'darwin',
  alwaysOnTop: DEFAULT_ALWAYS_ON_TOP,
  prompt: false,
  tokens: false,
  contextLimit: 0,
};

const agent = (sessionId: string, overrides: Partial<Agent> = {}): Agent => ({
  sessionId,
  name: sessionId,
  cwd: `${HOME}/GitHub/app`,
  kind: 'interactive',
  startedAt: 0,
  state: 'waiting',
  rawState: 'idle',
  pid: undefined,
  id: undefined,
  meta: undefined,
  ...overrides,
});

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 's1',
  time: '09:00',
  cwd: `${HOME}/GitHub/app`,
  prompt: '今日の TODO を整理して',
  enabled: true,
  lastFiredAt: null,
  ...overrides,
});

const createBridge = (overrides: Partial<CcParkBridge> = {}): CcParkBridge => ({
  getConfig: vi.fn(async () => config),
  fetchAgents: vi.fn(async (): Promise<FetchAgentsResult> => ({ ok: true, agents: [] })),
  stopAgent: vi.fn(async () => ({ ok: true as const })),
  killAgent: vi.fn(async () => ({ ok: true as const })),
  writeClipboard: vi.fn(async () => true),
  setAlwaysOnTop: vi.fn(async (value: boolean) => value),
  listSchedules: vi.fn(async () => []),
  saveSchedule: vi.fn(async () => []),
  deleteSchedule: vi.fn(async () => []),
  setScheduleEnabled: vi.fn(async () => []),
  onScheduleFired: vi.fn(() => () => undefined),
  notify: vi.fn(),
  quit: vi.fn(),
  ...overrides,
});

const setup = async (
  bridgeOverrides: Partial<CcParkBridge> = {},
  configOverrides: Partial<GuiConfig> = {},
) => {
  const bridge = createBridge(bridgeOverrides);
  const result = render(<GuiApp config={{ ...config, ...configOverrides }} bridge={bridge} />);
  // 初回取得の解決を待ってから検証する
  await act(async () => undefined);
  return { ...result, bridge, user: userEvent.setup() };
};

afterEach(cleanup);

describe('GuiApp', () => {
  it('取得したセッションを一覧表示する', async () => {
    await setup({
      fetchAgents: vi.fn(async () => ({ ok: true as const, agents: [agent('a'), agent('b')] })),
    });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('2 sessions')).toBeDefined();
  });

  it('取得に失敗したらエラーを表示する', async () => {
    await setup({
      fetchAgents: vi.fn(async () => ({
        ok: false as const,
        error: { kind: 'not-found' as const, message: 'claude が見つかりません' },
      })),
    });
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('claude が見つかりません')).toBeDefined();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('0 件なら空状態を表示する', async () => {
    await setup();
    expect(screen.getByText(/セッションはありません/)).toBeDefined();
  });

  it('要対応のセッションを先頭に並べる', async () => {
    await setup({
      fetchAgents: vi.fn(async () => ({
        ok: true as const,
        agents: [agent('idle'), agent('blocked', { state: 'blocked', kind: 'background', id: 'x' })],
      })),
    });
    expect(screen.getAllByRole('option')[0]?.textContent).toContain('blocked');
  });

  it('行のクリックで選択が移動する', async () => {
    const { user } = await setup({
      fetchAgents: vi.fn(async () => ({ ok: true as const, agents: [agent('a'), agent('b')] })),
    });
    await user.click(screen.getAllByRole('option')[1] as HTMLElement);
    expect(screen.getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('ダブルクリックでその行の resume コマンドをコピーする', async () => {
    const writeClipboard = vi.fn(async () => true);
    const { user } = await setup({
      writeClipboard,
      fetchAgents: vi.fn(async () => ({ ok: true as const, agents: [agent('a'), agent('b')] })),
    });
    await user.dblClick(screen.getAllByRole('option')[1] as HTMLElement);
    expect(writeClipboard).toHaveBeenCalledWith('claude --resume b');
  });

  it('更新ボタンで再取得する', async () => {
    const fetchAgents = vi.fn(async (): Promise<FetchAgentsResult> => ({ ok: true, agents: [] }));
    const { user } = await setup({ fetchAgents });
    const before = fetchAgents.mock.calls.length;
    await user.click(screen.getByRole('button', { name: '更新' }));
    expect(fetchAgents.mock.calls.length).toBeGreaterThan(before);
  });

  it('通知トグルで表示が切り替わる', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'notify:ON' }));
    expect(screen.getByRole('button', { name: 'notify:off' })).toBeDefined();
    expect(screen.getByText('OS 通知を OFF にしました')).toBeDefined();
  });

  it('--no-notify で起動したら通知は無効から始まる', async () => {
    await setup({}, { notify: false });
    expect(screen.getByRole('button', { name: 'notify:off' })).toBeDefined();
  });

  it('自分自身のセッションに [self] を付ける', async () => {
    await setup(
      { fetchAgents: vi.fn(async () => ({ ok: true as const, agents: [agent('a')] })) },
      { selfSessionId: 'a' },
    );
    expect(screen.getByText('[self]')).toBeDefined();
  });

  it('cwd はホームを ~ に短縮して表示する', async () => {
    await setup({
      fetchAgents: vi.fn(async () => ({ ok: true as const, agents: [agent('a')] })),
    });
    expect(screen.getByText('~/GitHub/app')).toBeDefined();
  });

  it('s キーで stop の確認ダイアログを出し、実行できる', async () => {
    const stopAgent = vi.fn(async () => ({ ok: true as const }));
    await setup({
      stopAgent,
      fetchAgents: vi.fn(async () => ({
        ok: true as const,
        agents: [agent('a', { kind: 'background', id: 'bg-a' })],
      })),
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    });
    expect(screen.getByRole('dialog')).toBeDefined();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'stop する' }));
    await waitFor(() => {
      expect(stopAgent).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('確認ダイアログの取消では stop しない', async () => {
    const stopAgent = vi.fn(async () => ({ ok: true as const }));
    const { user } = await setup({
      stopAgent,
      fetchAgents: vi.fn(async () => ({
        ok: true as const,
        agents: [agent('a', { kind: 'background', id: 'bg-a' })],
      })),
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    });
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(stopAgent).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('起動直後は最前面固定が有効', async () => {
    await setup();
    expect(screen.getByRole('button', { name: 'top:ON' })).toBeDefined();
  });

  it('main が固定できていなければ解除状態で表示する', async () => {
    await setup({}, { alwaysOnTop: false });
    expect(screen.getByRole('button', { name: 'top:off' })).toBeDefined();
  });

  it('最前面トグルで main へ解除を要求し、表示も切り替わる', async () => {
    const setAlwaysOnTop = vi.fn(async (value: boolean) => value);
    const { user } = await setup({ setAlwaysOnTop });

    await user.click(screen.getByRole('button', { name: 'top:ON' }));

    expect(setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'top:off' })).toBeDefined();
    expect(screen.getByText('最前面固定を解除しました')).toBeDefined();
  });

  it('もう一度押すと最前面に固定し直す', async () => {
    const setAlwaysOnTop = vi.fn(async (value: boolean) => value);
    const { user } = await setup({ setAlwaysOnTop });

    await user.click(screen.getByRole('button', { name: 'top:ON' }));
    await user.click(screen.getByRole('button', { name: 'top:off' }));

    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'top:ON' })).toBeDefined();
  });

  it('main が解除できなかった場合は表示を戻す', async () => {
    const { user } = await setup({ setAlwaysOnTop: vi.fn(async () => true) });

    await user.click(screen.getByRole('button', { name: 'top:ON' }));

    expect(screen.getByRole('button', { name: 'top:ON' })).toBeDefined();
    expect(screen.getByText('最前面に固定しました')).toBeDefined();
  });

  it('t キーでも最前面固定を切り替えられる', async () => {
    const setAlwaysOnTop = vi.fn(async (value: boolean) => value);
    await setup({ setAlwaysOnTop });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
    });

    await waitFor(() => {
      expect(setAlwaysOnTop).toHaveBeenCalledWith(false);
    });
  });

  it('x キーで kill の確認ダイアログを出し、実行できる', async () => {
    const killAgent = vi.fn(async () => ({ ok: true as const }));
    await setup({
      killAgent,
      fetchAgents: vi.fn(async () => ({
        ok: true as const,
        agents: [agent('a', { pid: 4321 })],
      })),
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    });
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('kill の確認');
    expect(screen.getByText('「a」を kill しますか?')).toBeDefined();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'kill する' }));
    await waitFor(() => {
      expect(killAgent).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('kill の確認ダイアログの取消では kill しない', async () => {
    const killAgent = vi.fn(async () => ({ ok: true as const }));
    const { user } = await setup({
      killAgent,
      fetchAgents: vi.fn(async () => ({
        ok: true as const,
        agents: [agent('a', { pid: 4321 })],
      })),
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    });
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(killAgent).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('PID を持たないセッションでは kill の確認を出さない', async () => {
    await setup({
      fetchAgents: vi.fn(async () => ({
        ok: true as const,
        agents: [agent('a', { kind: 'background', id: 'bg-a' })],
      })),
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/kill できません/)).toBeDefined();
  });

  it('q キーでアプリを終了する', async () => {
    const quit = vi.fn();
    await setup({ quit });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    });
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('作業完了を検出したら OS 通知を出す', async () => {
    const notify = vi.fn();
    const responses: FetchAgentsResult[] = [
      { ok: true, agents: [agent('a', { state: 'working' })] },
      { ok: true, agents: [agent('a', { state: 'waiting' })] },
    ];
    const fetchAgents = vi.fn(async () => responses.shift() ?? { ok: true as const, agents: [] });
    const { user } = await setup({ notify, fetchAgents });

    await user.click(screen.getByRole('button', { name: '更新' }));

    await waitFor(() => {
      expect(notify).toHaveBeenCalledTimes(1);
    });
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ message: 'a が入力待ちになりました' });
  });

  it('a キーで予約画面を開き、Escape で閉じる', async () => {
    await setup({ listSchedules: vi.fn(async () => [schedule()]) });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '予約' })).toBeDefined();
    });
    expect(screen.getByText('今日の TODO を整理して')).toBeDefined();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByRole('dialog', { name: '予約' })).toBeNull();
  });

  it('予約ボタンからも開く', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: '予約' }));
    expect(screen.getByRole('dialog', { name: '予約' })).toBeDefined();
  });

  it('予約画面を開いている間は一覧のキー操作を止める', async () => {
    const quit = vi.fn();
    await setup({ quit });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    });
    expect(quit).not.toHaveBeenCalled();
  });

  it('予約を削除すると main へ伝える', async () => {
    const deleteSchedule = vi.fn(async () => []);
    const { user } = await setup({
      listSchedules: vi.fn(async () => [schedule()]),
      deleteSchedule,
    });

    await user.click(screen.getByRole('button', { name: '予約' }));
    await user.click(screen.getByRole('button', { name: '削除' }));
    await user.click(screen.getByRole('button', { name: '削除 する' }));
    expect(deleteSchedule).toHaveBeenCalledWith('s1');
  });

  it('予約の有効・無効を切り替えると main へ伝える', async () => {
    const setScheduleEnabled = vi.fn(async () => []);
    const { user } = await setup({
      listSchedules: vi.fn(async () => [schedule()]),
      setScheduleEnabled,
    });

    await user.click(screen.getByRole('button', { name: '予約' }));
    await user.click(screen.getByRole('button', { name: 'on' }));
    expect(setScheduleEnabled).toHaveBeenCalledWith('s1', false);
  });

  it('予約を追加すると main へ伝える', async () => {
    const saveSchedule = vi.fn(async (_schedule: Schedule) => []);
    const { user } = await setup({ saveSchedule });

    await user.click(screen.getByRole('button', { name: '予約' }));
    await user.click(screen.getByRole('button', { name: '追加' }));
    await user.type(screen.getByLabelText('プロンプト'), 'おはよう');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(saveSchedule).toHaveBeenCalledTimes(1);
    expect(saveSchedule.mock.calls[0]?.[0]).toMatchObject({ prompt: 'おはよう' });
  });

  it('予約の発火をフッタに出す', async () => {
    let fire: ((event: ScheduleFiredEvent) => void) | null = null;
    await setup({
      onScheduleFired: vi.fn((listener: (event: ScheduleFiredEvent) => void) => {
        fire = listener;
        return () => undefined;
      }),
    });

    act(() => {
      fire?.({
        scheduleId: 's1',
        firedAt: 0,
        ok: true,
        message: '09:00 の予約を /Users/naoki で起動しました',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('09:00 の予約を /Users/naoki で起動しました')).toBeDefined();
    });
  });
});
