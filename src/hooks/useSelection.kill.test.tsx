import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KillAgentResult } from '../core/killAgent.js';
import type { Agent } from '../types/agent.js';
import { useSelection, type UseSelectionOptions, type UseSelectionResult } from './useSelection.js';

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

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
  meta: undefined,
};

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
  meta: undefined,
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

const setup = (
  agents: readonly Agent[] = [interactiveAgent],
  killResult: KillAgentResult = { ok: true },
) => {
  const onRefresh = vi.fn();
  const kill = vi.fn(async () => killResult);
  const stop = vi.fn(async () => ({ ok: true }) as const);
  const result = render(
    <Harness
      agents={agents}
      onRefresh={onRefresh}
      onToggleNotify={vi.fn(() => true)}
      copy={() => true}
      stop={stop}
      kill={kill}
    />,
  );
  return { ...result, onRefresh, kill, stop };
};

describe('useSelection の kill 操作', () => {
  beforeEach(() => {
    latest = null;
  });

  it('x で確認待ちに入る', async () => {
    const { stdin, kill, unmount } = setup();
    stdin.write('x');
    await wait();
    expect(state().pendingAction).toEqual({ kind: 'kill', sessionId: 'int-1' });
    expect(state().message).toContain('kill しますか');
    expect(kill).not.toHaveBeenCalled();
    unmount();
  });

  it('y で kill を実行し、完了したら再取得する', async () => {
    const { stdin, kill, onRefresh, unmount } = setup();
    stdin.write('x');
    await wait();
    stdin.write('y');
    await wait();
    expect(kill).toHaveBeenCalledWith(interactiveAgent);
    expect(state().message).toBe('kill しました: naoki-16');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('失敗したらエラーメッセージを出し再取得しない', async () => {
    const { stdin, onRefresh, unmount } = setup([interactiveAgent], {
      ok: false,
      error: { kind: 'permission', message: 'プロセスを終了する権限がありません。' },
    });
    stdin.write('x');
    await wait();
    stdin.write('y');
    await wait();
    expect(state().message).toBe(
      'kill に失敗しました: プロセスを終了する権限がありません。',
    );
    expect(onRefresh).not.toHaveBeenCalled();
    unmount();
  });

  it('y 以外のキーで取り消す', async () => {
    const { stdin, kill, unmount } = setup();
    stdin.write('x');
    await wait();
    stdin.write('r');
    await wait();
    expect(state().pendingAction).toBeNull();
    expect(state().message).toBe('kill を取り消しました');
    expect(kill).not.toHaveBeenCalled();
    unmount();
  });

  it('background では確認待ちに入らず stop を案内する', async () => {
    const { stdin, kill, unmount } = setup([backgroundAgent]);
    stdin.write('x');
    await wait();
    expect(state().pendingAction).toBeNull();
    expect(state().message).toContain('background セッションは kill できません');
    expect(kill).not.toHaveBeenCalled();
    unmount();
  });

  it('stop の確認待ち中の x は取消として扱う', async () => {
    const { stdin, kill, stop, unmount } = setup([backgroundAgent]);
    stdin.write('s');
    await wait();
    stdin.write('x');
    await wait();
    expect(state().message).toBe('stop を取り消しました');
    expect(stop).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
    unmount();
  });

  it('一覧が空なら何も起きない', async () => {
    const { stdin, kill, unmount } = setup([]);
    stdin.write('x');
    await wait();
    expect(state().pendingAction).toBeNull();
    expect(state().message).toBeNull();
    expect(kill).not.toHaveBeenCalled();
    unmount();
  });

  it('確認中に対象が一覧から消えたら実行しない', async () => {
    const kill = vi.fn(async (): Promise<KillAgentResult> => ({ ok: true }));
    const props: UseSelectionOptions = {
      agents: [interactiveAgent],
      onRefresh: vi.fn(),
      onToggleNotify: vi.fn(() => true),
      copy: () => true,
      kill,
    };

    const { stdin, rerender, unmount } = render(<Harness {...props} />);
    stdin.write('x');
    await wait();

    rerender(<Harness {...props} agents={[]} />);
    await wait();

    stdin.write('y');
    await wait();

    expect(kill).not.toHaveBeenCalled();
    expect(state().message).toBe('kill 対象が見つかりませんでした');
    unmount();
  });
});
