import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StopAgentResult } from '../core/stopAgent.js';
import type { Agent } from '../types/agent.js';
import { useSelection, type UseSelectionOptions, type UseSelectionResult } from './useSelection.js';

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

const backgroundAgent: Agent = {
  sessionId: 'bg-1',
  name: 'claude agents setup',
  cwd: '/Users/naoki',
  kind: 'background',
  startedAt: 0,
  state: 'blocked',
  rawState: 'blocked',
  pid: undefined,
  id: '2160cf1c',
};

const interactiveAgent: Agent = {
  sessionId: 'int-1',
  name: 'naoki-16',
  cwd: '/Users/naoki',
  kind: 'interactive',
  startedAt: 0,
  state: 'waiting',
  rawState: 'idle',
  pid: 71547,
  id: undefined,
};

// メッセージが長く端末幅で折り返されるため、描画結果ではなく戻り値を直接見る
let latest: UseSelectionResult | null = null;

const Harness = (props: UseSelectionOptions) => {
  latest = useSelection(props);
  return <Text>ok</Text>;
};

const state = (): UseSelectionResult => {
  if (latest === null) {
    throw new Error('useSelection がまだ実行されていません');
  }
  return latest;
};

const baseProps = (overrides: Partial<UseSelectionOptions> = {}): UseSelectionOptions => ({
  agents: [backgroundAgent],
  onRefresh: vi.fn(),
  onToggleNotify: vi.fn(() => true),
  copy: () => true,
  stop: vi.fn(async () => ({ ok: true }) as StopAgentResult),
  ...overrides,
});

const setup = (
  agents: readonly Agent[] = [backgroundAgent],
  stopResult: StopAgentResult = { ok: true },
) => {
  const onRefresh = vi.fn();
  const stop = vi.fn(async () => stopResult);
  const result = render(<Harness {...baseProps({ agents, onRefresh, stop })} />);
  return { ...result, onRefresh, stop };
};

describe('useSelection の stop 操作', () => {
  beforeEach(() => {
    latest = null;
  });

  it('s で確認待ちに入る', async () => {
    const { stdin, unmount } = setup();
    stdin.write('s');
    await wait();
    expect(state().pendingAction).toEqual({ kind: 'stop', sessionId: 'bg-1' });
    expect(state().message).toContain('stop しますか');
    unmount();
  });

  it('確認待ちの時点ではまだ stop を実行しない', async () => {
    const { stdin, stop, unmount } = setup();
    stdin.write('s');
    await wait();
    expect(stop).not.toHaveBeenCalled();
    unmount();
  });

  it('y で stop を実行する', async () => {
    const { stdin, stop, unmount } = setup();
    stdin.write('s');
    await wait();
    stdin.write('y');
    await wait();
    expect(stop).toHaveBeenCalledWith(backgroundAgent);
    unmount();
  });

  it('成功したら完了メッセージを出して再取得する', async () => {
    const { stdin, onRefresh, unmount } = setup();
    stdin.write('s');
    await wait();
    stdin.write('y');
    await wait();
    expect(state().message).toBe('stop しました: claude agents setup');
    expect(state().pendingAction).toBeNull();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('失敗したらエラーメッセージを出し再取得しない', async () => {
    const { stdin, onRefresh, unmount } = setup([backgroundAgent], {
      ok: false,
      error: { kind: 'exit', message: 'no such session' },
    });
    stdin.write('s');
    await wait();
    stdin.write('y');
    await wait();
    expect(state().message).toBe('stop に失敗しました: no such session');
    expect(onRefresh).not.toHaveBeenCalled();
    unmount();
  });

  it('y 以外のキーで取り消す', async () => {
    const { stdin, stop, unmount } = setup();
    stdin.write('s');
    await wait();
    stdin.write('n');
    await wait();
    expect(state().pendingAction).toBeNull();
    expect(state().message).toBe('stop を取り消しました');
    expect(stop).not.toHaveBeenCalled();
    unmount();
  });

  it('確認待ち中のキーは通常操作へ流れない', async () => {
    const { stdin, onRefresh, unmount } = setup();
    stdin.write('s');
    await wait();
    // r は本来「更新」だが、確認待ち中は取消として消費される
    stdin.write('r');
    await wait();
    expect(state().message).toBe('stop を取り消しました');
    expect(onRefresh).not.toHaveBeenCalled();
    unmount();
  });

  it('interactive では確認待ちに入らず理由を出す', async () => {
    const { stdin, stop, unmount } = setup([interactiveAgent]);
    stdin.write('s');
    await wait();
    expect(state().pendingAction).toBeNull();
    expect(state().message).toContain('interactive セッションは stop できません');
    expect(stop).not.toHaveBeenCalled();
    unmount();
  });

  it('一覧が空なら何も起きない', async () => {
    const { stdin, stop, unmount } = setup([]);
    stdin.write('s');
    await wait();
    expect(state().pendingAction).toBeNull();
    expect(state().message).toBeNull();
    expect(stop).not.toHaveBeenCalled();
    unmount();
  });

  it('確認中に対象が一覧から消えたら実行しない', async () => {
    const stop = vi.fn(async (): Promise<StopAgentResult> => ({ ok: true }));
    const props = baseProps({ stop });

    const { stdin, rerender, unmount } = render(<Harness {...props} />);
    stdin.write('s');
    await wait();

    rerender(<Harness {...props} agents={[]} />);
    await wait();

    stdin.write('y');
    await wait();

    expect(stop).not.toHaveBeenCalled();
    expect(state().message).toBe('stop 対象が見つかりませんでした');
    unmount();
  });

  it('アンマウント後は結果を反映しない', async () => {
    let resolveStop: ((result: StopAgentResult) => void) | undefined;
    const stop = vi.fn(
      () =>
        new Promise<StopAgentResult>((resolve) => {
          resolveStop = resolve;
        }),
    );
    const onRefresh = vi.fn();
    const { stdin, unmount } = render(<Harness {...baseProps({ stop, onRefresh })} />);

    stdin.write('s');
    await wait();
    stdin.write('y');
    await wait();

    unmount();
    resolveStop?.({ ok: true });
    await wait();

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
