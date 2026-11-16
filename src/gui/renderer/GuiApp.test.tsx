// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchAgentsResult } from '../../core/fetchAgents.js';
import type { ScheduleFiredEvent } from '../../core/scheduler.js';
import {
  DEFAULT_ATTENTION_SETTINGS,
  type AttentionSettings,
} from '../../shared/attention.js';
import { DEFAULT_COMPACT_SETTINGS, type CompactSettings } from '../../shared/compactSettings.js';
import { NOTIFY_SETTLE_MS } from '../../shared/notification.js';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from '../../shared/notificationSettings.js';
import { DEFAULT_OPEN_SETTINGS, type OpenSettings } from '../../shared/openSettings.js';
import type { Schedule } from '../../shared/schedule.js';
import { DEFAULT_APPEARANCE, PALETTES, type Appearance } from '../../shared/themes.js';
import type { Agent } from '../../types/agent.js';
import { DEFAULT_ALWAYS_ON_TOP, DEFAULT_OPACITY, type GuiConfig } from '../config.js';
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
  opacity: DEFAULT_OPACITY,
  prompt: false,
  tokens: false,
  contextLimit: 0,
  theme: null,
  accent: null,
  frame: null,
  debug: false,
  appearance: DEFAULT_APPEARANCE,
  compact: DEFAULT_COMPACT_SETTINGS,
  attention: DEFAULT_ATTENTION_SETTINGS,
  notification: DEFAULT_NOTIFICATION_SETTINGS,
  open: DEFAULT_OPEN_SETTINGS,
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
  launchApp: undefined,
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
  focusSession: vi.fn(async () => ({ ok: false as const, reason: '移動できません' })),
  writeClipboard: vi.fn(async () => true),
  setAlwaysOnTop: vi.fn(async (value: boolean) => value),
  moveWindow: vi.fn(async () => 'bottomRight' as const),
  showAgentMenu: vi.fn(),
  onAgentMenuAction: vi.fn(() => () => undefined),
  setAppearance: vi.fn(async (value: Appearance) => value),
  setOpacity: vi.fn(async (value: number) => value),
  setCompact: vi.fn(async (compact: boolean) => compact),
  saveCompactSettings: vi.fn(async (settings: CompactSettings) => settings),
  setAttention: vi.fn(),
  saveAttentionSettings: vi.fn(async (settings: AttentionSettings) => settings),
  saveNotificationSettings: vi.fn(async (settings: NotificationSettings) => settings),
  saveOpenSettings: vi.fn(async (settings: OpenSettings) => settings),
  pickDirectory: vi.fn(async () => null),
  listSchedules: vi.fn(async () => []),
  saveSchedule: vi.fn(async () => []),
  deleteSchedule: vi.fn(async () => []),
  setScheduleEnabled: vi.fn(async () => []),
  runSchedule: vi.fn(async () => null),
  listScheduledLaunches: vi.fn(async () => []),
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

afterEach(() => {
  cleanup();
  // 見た目は <html> 要素に書き込まれるため、テストごとに消しておく
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-frame');
  document.documentElement.removeAttribute('style');
});

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

  it('ダブルクリックでその行のセッションの画面へ移動する', async () => {
    const focusSession = vi.fn(async () => ({
      ok: true as const,
      target: 'tab' as const,
      app: 'iTerm2',
    }));
    const writeClipboard = vi.fn(async () => true);
    const { user } = await setup({
      focusSession,
      writeClipboard,
      fetchAgents: vi.fn(async () => ({ ok: true as const, agents: [agent('a'), agent('b')] })),
    });
    await user.dblClick(screen.getAllByRole('option')[1] as HTMLElement);
    expect(focusSession).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'b' }));
    expect(writeClipboard).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('iTerm2 のタブへ移動しました: b')).toBeDefined();
    });
  });

  it('移動できなければダブルクリックした行の resume コマンドをコピーする', async () => {
    const writeClipboard = vi.fn(async () => true);
    const { user } = await setup({
      writeClipboard,
      fetchAgents: vi.fn(async () => ({ ok: true as const, agents: [agent('a'), agent('b')] })),
    });
    await user.dblClick(screen.getAllByRole('option')[1] as HTMLElement);
    await waitFor(() => {
      expect(writeClipboard).toHaveBeenCalledWith(
        'cd /Users/naoki/GitHub/app && claude --resume b',
      );
    });
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

  describe('行の右クリックメニュー', () => {
    type Listener = (selection: { sessionId: string; action: 'open' | 'copy' | 'stop' | 'kill' }) => void;

    const menuBridge = () => {
      let listener: Listener | null = null;
      const showAgentMenu = vi.fn();
      const onAgentMenuAction = vi.fn((next: Listener) => {
        listener = next;
        return () => {
          listener = null;
        };
      });
      const choose = (sessionId: string, action: 'open' | 'copy' | 'stop' | 'kill') => {
        act(() => {
          listener?.({ sessionId, action });
        });
      };
      return { showAgentMenu, onAgentMenuAction, choose };
    };

    const twoAgents = () =>
      vi.fn(async () => ({
        ok: true as const,
        agents: [agent('a', { pid: 4321 }), agent('b', { kind: 'background', id: 'bg-b' })],
      }));

    it('右クリックした行を選び、その行で使える操作をメニューに渡す', async () => {
      const { showAgentMenu, onAgentMenuAction } = menuBridge();
      await setup({ showAgentMenu, onAgentMenuAction, fetchAgents: twoAgents() });

      fireEvent.contextMenu(screen.getAllByRole('option')[1] as HTMLElement);

      expect(screen.getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true');
      expect(showAgentMenu).toHaveBeenCalledWith({
        sessionId: 'b',
        canStop: true,
        canKill: false,
      });
    });

    it('「コピー」を選ぶと、その行の開くコマンドをコピーする', async () => {
      const { showAgentMenu, onAgentMenuAction, choose } = menuBridge();
      const writeClipboard = vi.fn(async () => true);
      await setup({ showAgentMenu, onAgentMenuAction, writeClipboard, fetchAgents: twoAgents() });

      choose('b', 'copy');
      await waitFor(() => {
        expect(writeClipboard).toHaveBeenCalledWith(`cd ${HOME}/GitHub/app && claude attach bg-b`);
      });
    });

    it('「開く」を選ぶと、その行のセッションの画面へ移動する', async () => {
      const { showAgentMenu, onAgentMenuAction, choose } = menuBridge();
      const focusSession = vi.fn(async () => ({
        ok: true as const,
        target: 'tab' as const,
        app: 'iTerm2',
      }));
      await setup({ showAgentMenu, onAgentMenuAction, focusSession, fetchAgents: twoAgents() });

      choose('a', 'open');
      expect(focusSession).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'a' }));
    });

    it('「stop」を選ぶと、s キーと同じく確認ダイアログを出す', async () => {
      const { showAgentMenu, onAgentMenuAction, choose } = menuBridge();
      const stopAgent = vi.fn(async () => ({ ok: true as const }));
      const { user } = await setup({
        showAgentMenu,
        onAgentMenuAction,
        stopAgent,
        fetchAgents: twoAgents(),
      });

      choose('b', 'stop');
      expect(screen.getByRole('dialog')).toBeDefined();
      await user.click(screen.getByRole('button', { name: 'stop する' }));
      await waitFor(() => {
        expect(stopAgent).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'b' }));
      });
    });

    it('メニューを開いている間に一覧から消えたセッションへの操作は無視する', async () => {
      const { showAgentMenu, onAgentMenuAction, choose } = menuBridge();
      const writeClipboard = vi.fn(async () => true);
      await setup({ showAgentMenu, onAgentMenuAction, writeClipboard, fetchAgents: twoAgents() });

      choose('gone', 'copy');
      expect(writeClipboard).not.toHaveBeenCalled();
    });
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

  it('起動直後は main が適用した不透明度を表示する', async () => {
    await setup({}, { opacity: 0.8 });
    expect(screen.getByRole('button', { name: 'opacity:80%' })).toBeDefined();
  });

  it('不透明度トグルを押すたびに段階を進め、一巡すると不透明へ戻る', async () => {
    const setOpacity = vi.fn(async (value: number) => value);
    const { user } = await setup({ setOpacity });

    await user.click(screen.getByRole('button', { name: 'opacity:100%' }));
    expect(setOpacity).toHaveBeenLastCalledWith(0.8);
    expect(screen.getByText('不透明度を 80% にしました')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'opacity:80%' }));
    expect(setOpacity).toHaveBeenLastCalledWith(0.6);

    await user.click(screen.getByRole('button', { name: 'opacity:60%' }));
    expect(setOpacity).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole('button', { name: 'opacity:100%' })).toBeDefined();
  });

  it('main が透過できなかった場合は適用後の値で表示する', async () => {
    const { user } = await setup({ setOpacity: vi.fn(async () => 1) });

    await user.click(screen.getByRole('button', { name: 'opacity:100%' }));

    expect(screen.getByRole('button', { name: 'opacity:100%' })).toBeDefined();
    expect(screen.getByText('不透明度を 100% にしました')).toBeDefined();
  });

  it('o キーでも不透明度を切り替えられる', async () => {
    const setOpacity = vi.fn(async (value: number) => value);
    await setup({ setOpacity });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }));
    });

    await waitFor(() => {
      expect(setOpacity).toHaveBeenCalledWith(0.8);
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
    // 作業完了は状態が続くのを待ってから通知するので、待つ時間を進める
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { bridge } = await setup({ notify, fetchAgents });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await user.click(screen.getByRole('button', { name: '更新' }));
      await waitFor(() => {
        expect(bridge.fetchAgents).toHaveBeenCalledTimes(2);
      });
      await act(async () => undefined);
      expect(notify).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(NOTIFY_SETTLE_MS);
      });
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0]?.[0]).toMatchObject({ message: 'a が入力待ちになりました' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('操作待ちの件数を main へ知らせ、変わったときだけ送り直す', async () => {
    const setAttention = vi.fn();
    const responses: FetchAgentsResult[] = [
      {
        ok: true,
        agents: [agent('a', { state: 'blocked' }), agent('b', { state: 'working' })],
      },
      {
        ok: true,
        agents: [agent('a', { state: 'blocked' }), agent('b', { state: 'waiting' })],
      },
    ];
    const fetchAgents = vi.fn(async () => responses.shift() ?? { ok: true as const, agents: [] });
    const { user } = await setup({ setAttention, fetchAgents });

    await waitFor(() => {
      expect(setAttention).toHaveBeenLastCalledWith({ blocked: 1, finished: 0 });
    });
    const callsBefore = setAttention.mock.calls.length;

    // b が作業を終えると DONE! になり、件数が増える
    await user.click(screen.getByRole('button', { name: '更新' }));
    await waitFor(() => {
      expect(setAttention).toHaveBeenLastCalledWith({ blocked: 1, finished: 1 });
    });
    expect(setAttention).toHaveBeenCalledTimes(callsBefore + 1);
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

  it('予約のディレクトリ選択を main へ取り次ぐ', async () => {
    const pickDirectory = vi.fn(async () => `${HOME}/GitHub/picked`);
    const saveSchedule = vi.fn(async () => []);
    const { user } = await setup({ pickDirectory, saveSchedule });

    await user.click(screen.getByRole('button', { name: '予約' }));
    await user.click(screen.getByRole('button', { name: '追加' }));
    await user.click(screen.getByRole('button', { name: '選択…' }));
    expect(pickDirectory).toHaveBeenCalledWith(HOME);

    await user.type(screen.getByLabelText('プロンプト'), 'おはよう');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(saveSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: `${HOME}/GitHub/picked` }),
    );
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

  it('予約を今すぐ実行すると、確認してから main へ伝える', async () => {
    const runSchedule = vi.fn(async () => null);
    const { user } = await setup({
      listSchedules: vi.fn(async () => [schedule()]),
      runSchedule,
    });

    await user.click(screen.getByRole('button', { name: '予約' }));
    await user.click(screen.getByRole('button', { name: '実行' }));
    expect(runSchedule).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '実行 する' }));
    expect(runSchedule).toHaveBeenCalledWith('s1');
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
        manual: false,
        ok: true,
        message: '09:00 の予約を /Users/naoki で起動しました',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('09:00 の予約を /Users/naoki で起動しました')).toBeDefined();
    });
  });

  it('予約から起動したセッションに [sched] を付ける', async () => {
    await setup({
      fetchAgents: vi.fn(
        async (): Promise<FetchAgentsResult> => ({
          ok: true,
          agents: [agent('bf96c05e-48ae', { kind: 'background', id: 'bf96c05e' })],
        }),
      ),
      listScheduledLaunches: vi.fn(async () => [
        { agentId: 'bf96c05e', scheduleId: 's1', time: '09:00', firedAt: 0 },
      ]),
    });

    await waitFor(() => {
      expect(screen.getByText('[sched]').getAttribute('title')).toBe('09:00 の予約で起動');
    });
  });

  it('最前面固定中だけ外周の枠を強調する', async () => {
    const { container, user } = await setup();
    expect(container.querySelector('.app')?.classList.contains('app--pinned')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'top:ON' }));
    expect(container.querySelector('.app')?.classList.contains('app--pinned')).toBe(false);
  });

  it('起動時の見た目を <html> 要素へ反映する', async () => {
    await setup({}, { appearance: { theme: 'navy', accent: '#f59e0b', frame: true } });
    const root = document.documentElement;
    expect(root.dataset['theme']).toBe('navy');
    expect(root.style.getPropertyValue('--bg')).toBe(PALETTES.navy.variables['--bg']);
    expect(root.style.getPropertyValue('--accent')).toBe('#f59e0b');
  });

  it('設定ボタンで設定画面を開き、選んだテーマを main へ伝えて反映する', async () => {
    const setAppearance = vi.fn(async (value: Appearance) => value);
    const { user } = await setup({ setAppearance });

    await user.click(screen.getByRole('button', { name: '設定' }));
    await user.click(screen.getByRole('radio', { name: 'フォレスト' }));

    expect(setAppearance).toHaveBeenCalledWith({ theme: 'forest', accent: null, frame: false });
    expect(document.documentElement.dataset['theme']).toBe('forest');
  });

  it('main が適用した見た目を正として持ち直す', async () => {
    // 保存できなかった等で main が別の値を返した場合も、画面は main の値に揃える
    const setAppearance = vi.fn(async () => ({ theme: 'dark' as const, accent: null, frame: true }));
    const { user } = await setup({ setAppearance });

    await user.click(screen.getByRole('button', { name: '設定' }));
    await user.click(screen.getByRole('radio', { name: 'セピア' }));

    await waitFor(() => {
      expect(document.documentElement.dataset['theme']).toBe('dark');
    });
  });

  it('設定画面を開いている間は一覧のキー操作を止め、Escape で閉じる', async () => {
    const quit = vi.fn();
    const { user } = await setup({ quit });

    await user.click(screen.getByRole('button', { name: '設定' }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    });
    expect(quit).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByRole('dialog', { name: '設定' })).toBeNull();
  });

  it('設定で枠線を描くと main へ伝え、<html> 要素へ反映する', async () => {
    const setAppearance = vi.fn(async (value: Appearance) => value);
    const { user } = await setup({ setAppearance });
    expect(document.documentElement.dataset['frame']).toBe('off');

    await user.click(screen.getByRole('button', { name: '設定' }));
    await user.click(screen.getByRole('checkbox', { name: 'ウィンドウの外周に枠線を描く' }));

    expect(setAppearance).toHaveBeenCalledWith({ theme: 'system', accent: null, frame: true });
    expect(document.documentElement.dataset['frame']).toBe('on');
  });
});

describe('GuiApp の操作待ちの件数の設定', () => {
  it('設定でバッジを消すと main へ伝えて保存させる', async () => {
    const saveAttentionSettings = vi.fn(async (settings: AttentionSettings) => settings);
    const { user } = await setup({ saveAttentionSettings });

    await user.click(screen.getByRole('button', { name: '設定' }));
    const checkbox = screen.getByRole('checkbox', { name: 'Dock のアイコンにバッジで出す' });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    await user.click(checkbox);

    expect(saveAttentionSettings).toHaveBeenCalledWith({ dockBadge: false, tray: true });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it('保存済みの設定から始める', async () => {
    const { user } = await setup({}, { attention: { dockBadge: true, tray: false } });
    await user.click(screen.getByRole('button', { name: '設定' }));
    expect(
      (screen.getByRole('checkbox', { name: 'メニューバーにアイコンを出す' }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });
});

describe('GuiApp の通知の条件', () => {
  it('設定で切った種類の遷移は通知しない', async () => {
    const notify = vi.fn();
    const responses: FetchAgentsResult[] = [
      { ok: true, agents: [agent('a', { state: 'working' })] },
      { ok: true, agents: [agent('a', { state: 'waiting' })] },
    ];
    const fetchAgents = vi.fn(async () => responses.shift() ?? { ok: true as const, agents: [] });
    const { user } = await setup(
      { notify, fetchAgents },
      { notification: { ...DEFAULT_NOTIFICATION_SETTINGS, finished: false } },
    );

    await user.click(screen.getByRole('button', { name: '更新' }));
    await waitFor(() => {
      expect(fetchAgents).toHaveBeenCalledTimes(2);
    });
    await act(async () => undefined);
    expect(notify).not.toHaveBeenCalled();
  });

  it('設定画面で変えた条件を main へ伝えて保存させる', async () => {
    const saveNotificationSettings = vi.fn(async (settings: NotificationSettings) => settings);
    const { user } = await setup({ saveNotificationSettings });

    await user.click(screen.getByRole('button', { name: '設定' }));
    await user.click(screen.getByRole('checkbox', { name: '通知音を鳴らす' }));

    expect(saveNotificationSettings).toHaveBeenCalledWith({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      sound: false,
    });
  });
});

describe('GuiApp の開くアプリの設定', () => {
  it('設定画面で選んだ開くアプリを main へ伝えて保存させる', async () => {
    const saveOpenSettings = vi.fn(async (settings: OpenSettings) => settings);
    const { user } = await setup({ saveOpenSettings });

    await user.click(screen.getByRole('button', { name: '設定' }));
    await user.click(screen.getByRole('radio', { name: 'iTerm2' }));

    expect(saveOpenSettings).toHaveBeenCalledWith({ fallbackApp: 'iTerm2' });
  });
});

describe('GuiApp の絞り込み', () => {
  const mixed = () =>
    vi.fn(async () => ({
      ok: true as const,
      agents: [
        agent('web', { state: 'waiting' }),
        agent('api', { state: 'working' }),
        agent('cli', { state: 'blocked', cwd: '/tmp/other' }),
      ],
    }));

  const press = (key: string) => {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    });
  };

  it('f で操作待ちだけを表示し、件数を 表示/全体 で出す', async () => {
    await setup({ fetchAgents: mixed() });
    press('f');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('2/3').getAttribute('title')).toBe('2/3 sessions [操作待ち]');
    expect(screen.getByRole('button', { name: '操作待ちだけ' })).toBeDefined();

    press('f');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('/ で検索欄を開き、入力した語で絞り込む。入力中の文字は一覧の操作に使わない', async () => {
    const quit = vi.fn();
    const { user } = await setup({ fetchAgents: mixed(), quit });
    press('/');
    const input = screen.getByRole('searchbox', { name: 'セッションを検索' });
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });

    await user.type(input, 'qweb');
    expect(quit).not.toHaveBeenCalled();
    // q は検索語に入り、web と合わせてどれにも当てはまらない
    expect(screen.getByText('条件に合うセッションはありません。')).toBeDefined();

    await user.clear(input);
    await user.type(input, 'web');
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('検索欄の Esc で検索語を消して閉じる', async () => {
    const { user } = await setup({ fetchAgents: mixed() });
    press('/');
    const input = screen.getByRole('searchbox', { name: 'セッションを検索' });
    await user.type(input, 'web{Escape}');
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('Enter で確定すると一覧のキー操作に戻り、Esc で検索語を消せる', async () => {
    const { user } = await setup({ fetchAgents: mixed() });
    press('/');
    const input = screen.getByRole('searchbox', { name: 'セッションを検索' });
    await user.type(input, 'web{Enter}');
    expect(screen.getAllByRole('option')).toHaveLength(1);

    press('Escape');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('見出しを押すとそのディレクトリを畳み、もう一度押すと開く', async () => {
    const { user } = await setup({ fetchAgents: mixed() });
    const header = screen.getByRole('button', { name: /\/tmp\/other/ });
    await user.click(header);
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('1 件')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /\/tmp\/other/ }));
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });
});

describe('GuiApp のミニ表示', () => {
  const pressKey = (key: string) => {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    });
  };

  const working = () =>
    vi.fn(async () => ({ ok: true as const, agents: [agent('a', { state: 'working' })] }));

  it('起動直後は畳まない', async () => {
    await setup({ fetchAgents: working() });
    expect(screen.getByRole('button', { name: 'mini' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: '開く' })).toBeNull();
  });

  it('mini を押すとすぐに畳み、測った大きさを main へ伝える', async () => {
    const setCompact = vi.fn(async (compact: boolean) => compact);
    const { user } = await setup({ fetchAgents: working(), setCompact });

    await user.click(screen.getByRole('button', { name: 'mini' }));
    expect(screen.getByRole('button', { name: '開く' })).toBeDefined();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(setCompact).toHaveBeenCalledWith(true, { width: 0, height: 0 });
  });

  it('「開く」で通常表示へ戻し、main に元の大きさへ戻させる', async () => {
    const setCompact = vi.fn(async (compact: boolean) => compact);
    const { user } = await setup({ fetchAgents: working(), setCompact });
    pressKey('m');

    await user.click(screen.getByRole('button', { name: '開く' }));
    expect(screen.getByRole('button', { name: 'mini' }).getAttribute('aria-pressed')).toBe('false');
    expect(setCompact).toHaveBeenLastCalledWith(false, null);
  });

  it('縦 1 列から始まり、ボタンで横 1 列と切り替えられる', async () => {
    const { container, user } = await setup({ fetchAgents: working() });
    pressKey('m');
    expect(container.querySelector('.mini-view--horizontal')).toBeNull();

    await user.click(screen.getByRole('button', { name: '横向' }));
    expect(container.querySelector('.mini-view--horizontal')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '縦向' }));
    expect(container.querySelector('.mini-view--horizontal')).toBeNull();
  });

  it('通常表示へ戻しても並びを覚えておく', async () => {
    const { container, user } = await setup({ fetchAgents: working() });
    pressKey('m');
    await user.click(screen.getByRole('button', { name: '横向' }));

    pressKey('m');
    pressKey('m');
    expect(container.querySelector('.mini-view--horizontal')).not.toBeNull();
  });

  it('設定がミニ表示・横 1 列なら、横 1 列で畳む', async () => {
    const setCompact = vi.fn(async (compact: boolean) => compact);
    const { container } = await setup(
      { fetchAgents: working(), setCompact },
      { compact: { mode: 'on', layout: 'horizontal' } },
    );
    expect(screen.getByRole('button', { name: '開く' })).toBeDefined();
    expect(container.querySelector('.mini-view--horizontal')).not.toBeNull();
    expect(setCompact).toHaveBeenCalledWith(true, { width: 0, height: 0 });
  });

  it('切り替えるたびに ON / OFF と並びを保存する', async () => {
    const saveCompactSettings = vi.fn(async (settings: CompactSettings) => settings);
    const { user } = await setup({ fetchAgents: working(), saveCompactSettings });
    expect(saveCompactSettings).not.toHaveBeenCalled();

    pressKey('m');
    expect(saveCompactSettings).toHaveBeenLastCalledWith({ mode: 'on', layout: 'vertical' });

    await user.click(screen.getByRole('button', { name: '横向' }));
    expect(saveCompactSettings).toHaveBeenLastCalledWith({ mode: 'on', layout: 'horizontal' });

    await user.click(screen.getByRole('button', { name: '開く' }));
    expect(saveCompactSettings).toHaveBeenLastCalledWith({ mode: 'off', layout: 'horizontal' });
  });

  it('予約画面などで一時的に広げたときは保存しない', async () => {
    const saveCompactSettings = vi.fn(async (settings: CompactSettings) => settings);
    await setup({ fetchAgents: working(), saveCompactSettings });
    pressKey('m');
    saveCompactSettings.mockClear();

    pressKey('a');
    pressKey('Escape');
    expect(saveCompactSettings).not.toHaveBeenCalled();
  });

  it('m キーでも切り替えられ、もう一度押すと通常表示へ戻す', async () => {
    await setup({ fetchAgents: working() });

    pressKey('m');
    expect(screen.getByRole('button', { name: '開く' })).toBeDefined();

    pressKey('m');
    expect(screen.getByRole('button', { name: 'mini' }).getAttribute('aria-pressed')).toBe('false');
  });

  it.each(['blocked', 'justFinished', 'unknown'] as const)(
    '%s のセッションがあっても畳んだままにする',
    async (state) => {
      await setup({
        fetchAgents: vi.fn(async () => ({ ok: true as const, agents: [agent('a', { state })] })),
      });
      pressKey('m');
      expect(screen.getByRole('button', { name: '開く' })).toBeDefined();
    },
  );

  it('取得に失敗している間は通常表示でエラーを見せる', async () => {
    await setup({
      fetchAgents: vi.fn(async () => ({
        ok: false as const,
        error: { kind: 'not-found' as const, message: 'claude が見つかりません' },
      })),
    });
    pressKey('m');
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('ミニ表示中に予約画面を開いたら広げて見せ、閉じたら畳み直す', async () => {
    await setup({ fetchAgents: working() });
    pressKey('m');

    pressKey('a');
    expect(screen.getByRole('dialog', { name: '予約' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '開く' })).toBeNull();

    pressKey('Escape');
    expect(screen.getByRole('button', { name: '開く' })).toBeDefined();
  });

  it('ミニ表示中に stop を求めたら広げて確認ダイアログを見せる', async () => {
    await setup({
      fetchAgents: vi.fn(async () => ({
        ok: true as const,
        agents: [agent('a', { state: 'working', kind: 'background', id: 'bg-a' })],
      })),
    });
    pressKey('m');
    expect(screen.getByRole('button', { name: '開く' })).toBeDefined();

    pressKey('s');
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('ミニ表示ではタイルを選択できない', async () => {
    const writeClipboard = vi.fn(async () => true);
    const { container, user } = await setup({ fetchAgents: working(), writeClipboard });
    pressKey('m');

    await user.click(container.querySelector('.mini-tile') as HTMLElement);
    expect(screen.queryByRole('option')).toBeNull();
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it('ミニ表示のタイルをダブルクリックすると、ミニ表示のままセッションの画面へ移動する', async () => {
    const focusSession = vi.fn(async () => ({
      ok: true as const,
      target: 'tab' as const,
      app: 'iTerm2',
    }));
    const { container, user } = await setup({
      focusSession,
      fetchAgents: vi.fn(async () => ({
        ok: true as const,
        agents: [agent('a', { state: 'working' }), agent('b', { state: 'working' })],
      })),
    });
    pressKey('m');

    await user.dblClick(container.querySelectorAll('.mini-tile')[1] as HTMLElement);
    expect(focusSession).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'b' }));
    expect(screen.getByRole('button', { name: '開く' })).toBeDefined();
    expect(screen.queryByRole('option')).toBeNull();
  });
});
