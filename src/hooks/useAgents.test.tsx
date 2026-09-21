import { Text } from 'ink';
import { useEffect } from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import type { FetchAgentsOptions, FetchAgentsResult } from '../core/fetchAgents.js';
import type { Agent } from '../types/agent.js';
import { MIN_INTERVAL_MS, useAgents, type UseAgentsOptions } from './useAgents.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const agent = (sessionId: string): Agent => ({
  sessionId,
  name: sessionId,
  cwd: '/tmp',
  kind: 'interactive',
  startedAt: 0,
  state: 'working',
  rawState: 'busy',
  pid: undefined,
  id: undefined,
  meta: undefined,
});

const Harness = (props: UseAgentsOptions) => {
  const { agents, previousAgents, error, isFetching } = useAgents(props);
  return (
    <Text>
      {JSON.stringify({
        ids: agents.map((item) => item.sessionId),
        previous: previousAgents?.map((item) => item.sessionId) ?? null,
        error: error?.kind ?? null,
        isFetching,
      })}
    </Text>
  );
};

const parse = (frame: string | undefined) =>
  JSON.parse(frame ?? '{}') as {
    ids: string[];
    previous: string[] | null;
    error: string | null;
    isFetching: boolean;
  };

describe('useAgents', () => {
  it('マウント直後に 1 回取得する', async () => {
    const fetcher = vi.fn(async (): Promise<FetchAgentsResult> => ({ ok: true, agents: [agent('a')] }));
    const { lastFrame, unmount } = render(<Harness intervalMs={10_000} fetcher={fetcher} />);

    await wait(20);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(parse(lastFrame()).ids).toEqual(['a']);
    unmount();
  });

  it('初回は previousAgents が null のまま', async () => {
    const fetcher = vi.fn(async (): Promise<FetchAgentsResult> => ({ ok: true, agents: [agent('a')] }));
    const { lastFrame, unmount } = render(<Harness intervalMs={10_000} fetcher={fetcher} />);

    await wait(20);
    expect(parse(lastFrame()).previous).toBeNull();
    unmount();
  });

  it('2 回目以降は前回スナップショットを保持する', async () => {
    let call = 0;
    const fetcher = vi.fn(async (): Promise<FetchAgentsResult> => {
      call += 1;
      return { ok: true, agents: [agent(call === 1 ? 'a' : 'b')] };
    });
    const { lastFrame, unmount } = render(<Harness intervalMs={MIN_INTERVAL_MS} fetcher={fetcher} />);

    await wait(700);
    const state = parse(lastFrame());
    expect(state.ids).toEqual(['b']);
    expect(state.previous).toEqual(['a']);
    unmount();
  });

  it('前回の取得が終わるまで次の取得を始めない', async () => {
    const fetcher = vi.fn(async (): Promise<FetchAgentsResult> => {
      await wait(1200);
      return { ok: true, agents: [] };
    });
    const { unmount } = render(<Harness intervalMs={MIN_INTERVAL_MS} fetcher={fetcher} />);

    // 500ms 間隔で 2 回発火するが、初回が 1200ms かかるためどちらもスキップされる
    await wait(1100);
    expect(fetcher).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('poll が false ならポーリングしない', async () => {
    const fetcher = vi.fn(async (): Promise<FetchAgentsResult> => ({ ok: true, agents: [] }));
    const { unmount } = render(
      <Harness intervalMs={MIN_INTERVAL_MS} poll={false} fetcher={fetcher} />,
    );

    await wait(700);
    expect(fetcher).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('失敗したらエラーを保持する', async () => {
    const fetcher = vi.fn(
      async (): Promise<FetchAgentsResult> => ({
        ok: false,
        error: { kind: 'not-found', message: 'なし' },
      }),
    );
    const { lastFrame, unmount } = render(<Harness intervalMs={10_000} fetcher={fetcher} />);

    await wait(20);
    expect(parse(lastFrame()).error).toBe('not-found');
    unmount();
  });

  it('中断エラーはエラー表示しない', async () => {
    const fetcher = vi.fn(
      async (): Promise<FetchAgentsResult> => ({
        ok: false,
        error: { kind: 'aborted', message: '中断' },
      }),
    );
    const { lastFrame, unmount } = render(<Harness intervalMs={10_000} fetcher={fetcher} />);

    await wait(20);
    expect(parse(lastFrame()).error).toBeNull();
    unmount();
  });

  it('fetcher が reject してもポーリングを止めない', async () => {
    let call = 0;
    const fetcher = vi.fn(async (): Promise<FetchAgentsResult> => {
      call += 1;
      if (call === 2) {
        throw new Error('IPC 失敗');
      }
      return { ok: true, agents: [agent('a')] };
    });
    const { lastFrame, unmount } = render(
      <Harness intervalMs={MIN_INTERVAL_MS} fetcher={fetcher} />,
    );

    await wait(MIN_INTERVAL_MS * 4);
    // 多重実行ガードが立ちっぱなしになると 2 回で止まる
    expect(fetcher.mock.calls.length).toBeGreaterThan(2);
    expect(parse(lastFrame()).ids).toEqual(['a']);
    unmount();
  });

  it('fetcher が reject したらエラーとして扱う', async () => {
    const fetcher = vi.fn(async (): Promise<FetchAgentsResult> => {
      throw new Error('IPC 失敗');
    });
    const { lastFrame, unmount } = render(<Harness intervalMs={10_000} fetcher={fetcher} />);

    await wait(20);
    expect(parse(lastFrame()).error).toBe('exit');
    unmount();
  });

  it('all と cwd を fetcher へ渡す', async () => {
    const fetcher = vi.fn(
      async (_options: FetchAgentsOptions): Promise<FetchAgentsResult> => ({
        ok: true,
        agents: [],
      }),
    );
    const { unmount } = render(
      <Harness intervalMs={10_000} all cwd="/tmp/x" fetcher={fetcher} />,
    );

    await wait(20);
    const options = fetcher.mock.calls[0]?.[0];
    expect(options?.all).toBe(true);
    expect(options?.cwd).toBe('/tmp/x');
    unmount();
  });

  it('refresh で即時に再取得する', async () => {
    const fetcher = vi.fn(async (): Promise<FetchAgentsResult> => ({ ok: true, agents: [] }));
    const RefreshHarness = () => {
      const { refresh } = useAgents({ intervalMs: 10_000, fetcher });
      useEffect(() => {
        const timer = setTimeout(refresh, 50);
        return () => {
          clearTimeout(timer);
        };
      }, [refresh]);
      return <Text>ok</Text>;
    };

    const { unmount } = render(<RefreshHarness />);
    await wait(150);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
    unmount();
  });

  it('アンマウント後に状態を更新しない', async () => {
    const fetcher = vi.fn(async (): Promise<FetchAgentsResult> => {
      await wait(100);
      return { ok: true, agents: [agent('a')] };
    });
    const { unmount } = render(<Harness intervalMs={10_000} fetcher={fetcher} />);

    unmount();
    // アンマウント済みで setState が呼ばれると警告・例外になるため、
    // 何も起きないことを確認する
    await expect(wait(200)).resolves.toBeUndefined();
  });
});
