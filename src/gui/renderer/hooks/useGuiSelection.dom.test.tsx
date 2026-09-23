// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KillAgentResult } from '../../../core/killAgent.js';
import type { StopAgentResult } from '../../../core/stopAgent.js';
import type { Agent } from '../../../types/agent.js';
import { isControlActivation, useGuiSelection, type UseGuiSelectionOptions } from './useGuiSelection.js';

const agent = (sessionId: string, overrides: Partial<Agent> = {}): Agent => ({
  sessionId,
  name: sessionId,
  cwd: '/tmp',
  kind: 'interactive',
  startedAt: 0,
  state: 'waiting',
  rawState: 'idle',
  pid: undefined,
  id: undefined,
  meta: undefined,
  ...overrides,
});

const background = (sessionId: string): Agent =>
  agent(sessionId, { kind: 'background', id: `bg-${sessionId}`, pid: undefined });

interface Snapshot {
  selectedIndex: number;
  selectedSessionId: string | null;
  message: string | null;
  pendingAction: { kind: string; sessionId: string } | null;
}

let snapshot: Snapshot;
let select: (index: number) => void;

const Harness = (props: UseGuiSelectionOptions) => {
  const core = useGuiSelection(props);
  const { selectedIndex, selectedSessionId, message, pendingAction } = core;
  snapshot = { selectedIndex, selectedSessionId, message, pendingAction };
  select = core.select;
  return <button type="button">ボタン</button>;
};

const press = (key: string) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

const stopped: StopAgentResult = { ok: true };
const killed: KillAgentResult = { ok: true };

const interactive = (sessionId: string): Agent => agent(sessionId, { pid: 4321 });

const setup = (overrides: Partial<UseGuiSelectionOptions> = {}) => {
  const onRefresh = vi.fn();
  const onToggleNotify = vi.fn(() => true);
  const onExit = vi.fn();
  const onToggleAlwaysOnTop = vi.fn(() => true);
  const onToggleSchedules = vi.fn();
  const copy = vi.fn(async () => true);
  const stop = vi.fn(async () => stopped);
  const kill = vi.fn(async () => killed);
  const result = render(
    <Harness
      agents={[agent('a'), agent('b'), agent('c')]}
      onRefresh={onRefresh}
      onToggleNotify={onToggleNotify}
      onExit={onExit}
      onToggleAlwaysOnTop={onToggleAlwaysOnTop}
      onToggleSchedules={onToggleSchedules}
      copy={copy}
      stop={stop}
      kill={kill}
      {...overrides}
    />,
  );
  return {
    ...result,
    onRefresh,
    onToggleNotify,
    onExit,
    onToggleAlwaysOnTop,
    onToggleSchedules,
    copy,
    stop,
    kill,
  };
};

afterEach(cleanup);

describe('isControlActivation', () => {
  it('ボタン上の Enter はボタン自身の操作として扱う', () => {
    const button = document.createElement('button');
    expect(isControlActivation('Enter', button)).toBe(true);
    expect(isControlActivation(' ', button)).toBe(true);
  });

  it('ボタン以外や別のキーは一覧の操作として扱う', () => {
    expect(isControlActivation('Enter', document.createElement('div'))).toBe(false);
    expect(isControlActivation('j', document.createElement('button'))).toBe(false);
    expect(isControlActivation('Enter', null)).toBe(false);
  });
});

describe('useGuiSelection', () => {
  it('キーボードでカーソルを動かせる', () => {
    setup();
    press('ArrowDown');
    expect(snapshot).toMatchObject({ selectedIndex: 1, selectedSessionId: 'b' });
    press('ArrowUp');
    expect(snapshot.selectedIndex).toBe(0);
  });

  it('c で resume コマンドをコピーする', async () => {
    const { copy } = setup();
    press('c');
    await act(async () => undefined);
    expect(copy).toHaveBeenCalledWith('cd /tmp && claude --resume a');
    expect(snapshot.message).toBe('コピーしました: cd /tmp && claude --resume a');
  });

  it('Enter ではコピーしない', async () => {
    const { copy } = setup();
    press('Enter');
    await act(async () => undefined);
    expect(copy).not.toHaveBeenCalled();
    expect(snapshot.message).toBeNull();
  });

  it('コピーできない環境では非対応と伝える', async () => {
    setup({ copy: vi.fn(async () => false) });
    press('c');
    await act(async () => undefined);
    expect(snapshot.message).toBe('コピー非対応の環境です: cd /tmp && claude --resume a');
  });

  it('r で再取得する', () => {
    const { onRefresh } = setup();
    press('r');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(snapshot.message).toBe('更新しました');
  });

  it('n で通知を切り替える', () => {
    const { onToggleNotify } = setup();
    press('n');
    expect(onToggleNotify).toHaveBeenCalledTimes(1);
    expect(snapshot.message).toBe('OS 通知を ON にしました');
  });

  it('t で最前面固定を切り替え、結果をメッセージに出す', async () => {
    const { onToggleAlwaysOnTop } = setup();
    press('t');
    await act(async () => undefined);
    expect(onToggleAlwaysOnTop).toHaveBeenCalledTimes(1);
    expect(snapshot.message).toBe('最前面に固定しました');
  });

  it('解除したときは解除のメッセージを出す', async () => {
    setup({ onToggleAlwaysOnTop: vi.fn(() => false) });
    press('t');
    await act(async () => undefined);
    expect(snapshot.message).toBe('最前面固定を解除しました');
  });

  it('非同期に適用される切り替えでも結果を待って表示する', async () => {
    setup({ onToggleAlwaysOnTop: vi.fn(async () => true) });
    press('t');
    await act(async () => undefined);
    expect(snapshot.message).toBe('最前面に固定しました');
  });

  it('stop の確認待ち中の t は取消として扱う', async () => {
    const { onToggleAlwaysOnTop } = setup({ agents: [background('a')] });
    press('s');
    press('t');
    await act(async () => undefined);
    expect(onToggleAlwaysOnTop).not.toHaveBeenCalled();
    expect(snapshot.pendingAction).toBeNull();
    expect(snapshot.message).toBe('stop を取り消しました');
  });

  it('q で終了する', () => {
    const { onExit } = setup();
    press('q');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('ボタンにフォーカスがある Enter は一覧操作にしない', () => {
    const { copy } = setup();
    const button = document.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(copy).not.toHaveBeenCalled();
  });

  it('修飾キー付きの入力は無視する', () => {
    const { onExit } = setup();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', metaKey: true }));
    });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('enabled が false ならキー入力を受け付けない', () => {
    const { onRefresh } = setup({ enabled: false });
    press('r');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('PID を持つセッションは x で kill の確認待ちへ入る', async () => {
    const { kill } = setup({ agents: [interactive('a')] });
    press('x');
    expect(snapshot.pendingAction).toEqual({ kind: 'kill', sessionId: 'a' });
    expect(snapshot.message).toContain('kill しますか');
    expect(kill).not.toHaveBeenCalled();

    press('y');
    await act(async () => undefined);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(snapshot.message).toBe('kill しました: a');
  });

  it('PID が無いセッションは kill できないと伝える', () => {
    setup({ agents: [background('a')] });
    press('x');
    expect(snapshot.pendingAction).toBeNull();
    expect(snapshot.message).toContain('kill できません');
  });

  it('kill の確認待ちも他キーで取り消せる', () => {
    const { kill } = setup({ agents: [interactive('a')] });
    press('x');
    press('Escape');
    expect(kill).not.toHaveBeenCalled();
    expect(snapshot.message).toBe('kill を取り消しました');
  });

  it('kill に失敗したら理由を出す', async () => {
    setup({
      agents: [interactive('a')],
      kill: vi.fn(async () => ({
        ok: false as const,
        error: { kind: 'permission' as const, message: '権限がありません' },
      })),
    });
    press('x');
    press('y');
    await act(async () => undefined);
    expect(snapshot.message).toBe('kill に失敗しました: 権限がありません');
  });

  it('位置を指定して選択できる', () => {
    setup();
    act(() => {
      select(2);
    });
    expect(snapshot.selectedSessionId).toBe('c');
  });

  it('範囲外の位置を指定しても選択は動かない', () => {
    setup();
    act(() => {
      select(-1);
      select(3);
    });
    expect(snapshot.selectedIndex).toBe(0);
  });

  it('interactive セッションは stop できないと伝える', () => {
    setup();
    press('s');
    expect(snapshot.pendingAction).toBeNull();
    expect(snapshot.message).toContain('stop できません');
  });

  it('background セッションは確認待ちへ入り、y で実行する', async () => {
    const { stop } = setup({ agents: [background('a')] });
    press('s');
    expect(snapshot.pendingAction).toEqual({ kind: 'stop', sessionId: 'a' });

    press('y');
    await act(async () => undefined);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(snapshot.message).toBe('stop しました: a');
  });

  it('確認待ち中の他キーは取消として消費する', () => {
    const { stop } = setup({ agents: [background('a')] });
    press('s');
    press('j');
    expect(stop).not.toHaveBeenCalled();
    expect(snapshot.pendingAction).toBeNull();
    expect(snapshot.message).toBe('stop を取り消しました');
  });

  it('Escape でも取り消せる', () => {
    setup({ agents: [background('a')] });
    press('s');
    press('Escape');
    expect(snapshot.message).toBe('stop を取り消しました');
  });

  it('stop に失敗したら理由を出す', async () => {
    setup({
      agents: [background('a')],
      stop: vi.fn(async () => ({ ok: false, error: { kind: 'exit' as const, message: 'だめ' } })),
    });
    press('s');
    press('y');
    await act(async () => undefined);
    expect(snapshot.message).toBe('stop に失敗しました: だめ');
  });
});

describe('予約画面の開閉', () => {
  it('a キーで開閉を伝える', () => {
    const { onToggleSchedules } = setup();
    press('a');
    expect(onToggleSchedules).toHaveBeenCalledTimes(1);
  });

  it('確認待ち中の a は取消として消費する', () => {
    const { onToggleSchedules } = setup({ agents: [background('a')] });
    press('s');
    expect(snapshot.pendingAction).not.toBeNull();

    press('a');
    expect(onToggleSchedules).not.toHaveBeenCalled();
    expect(snapshot.pendingAction).toBeNull();
  });
});

describe('アンマウント後の後始末', () => {
  it('コピー完了が閉じた後に届いてもメッセージを更新しない', async () => {
    let resolveCopy: ((copied: boolean) => void) | undefined;
    const copy = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCopy = resolve;
        }),
    );
    const { unmount } = setup({ copy });

    press('c');
    unmount();
    act(() => {
      resolveCopy?.(true);
    });
    await act(async () => undefined);

    expect(snapshot.message).toBeNull();
  });
});
