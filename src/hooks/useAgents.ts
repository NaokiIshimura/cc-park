import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  FetchAgentsOptions,
  FetchAgentsResult,
  FetchError,
} from '../core/fetchAgents.js';
import type { Agent } from '../types/agent.js';

/** ポーリング間隔の下限。外部コマンドの実行コストを踏まえて 500ms でクランプする。 */
export const MIN_INTERVAL_MS = 500;

export interface UseAgentsOptions {
  readonly intervalMs: number;
  readonly all?: boolean;
  readonly cwd?: string | undefined;
  /** false の場合は初回取得のみ行い、ポーリングしない */
  readonly poll?: boolean;
  /**
   * セッション取得の実装。
   *
   * この hook を renderer（ブラウザ）側からも使えるよう、`node:child_process` に依存する
   * 既定実装を静的 import せず、呼び出し側から注入させる。
   */
  readonly fetcher: (options: FetchAgentsOptions) => Promise<FetchAgentsResult>;
}

export interface UseAgentsResult {
  readonly agents: readonly Agent[];
  /** 1 回前のスナップショット。初回取得前は null */
  readonly previousAgents: readonly Agent[] | null;
  readonly error: FetchError | null;
  readonly lastUpdatedAt: number | null;
  readonly isFetching: boolean;
  readonly refresh: () => void;
}

/**
 * `fetcher` を一定間隔で実行し、結果を保持する。
 *
 * - 前回の取得が終わっていなければ今回をスキップする（多重実行ガード）
 * - アンマウント時に interval をクリアし、実行中のプロセスも abort する
 */
export const useAgents = (options: UseAgentsOptions): UseAgentsResult => {
  const { intervalMs, all = false, cwd, poll = true, fetcher } = options;

  const [agents, setAgents] = useState<readonly Agent[]>([]);
  const [previousAgents, setPreviousAgents] = useState<readonly Agent[] | null>(null);
  const [error, setError] = useState<FetchError | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<readonly Agent[] | null>(null);

  const load = useCallback(async () => {
    // 多重実行ガード: 前回が終わるまで新しい取得を始めない
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setIsFetching(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const result = await fetcher({ all, cwd, signal: controller.signal });

    inFlightRef.current = false;
    abortRef.current = null;
    if (!mountedRef.current) {
      return;
    }
    setIsFetching(false);

    if (result.ok) {
      setPreviousAgents(snapshotRef.current);
      snapshotRef.current = result.agents;
      setAgents(result.agents);
      setError(null);
      setLastUpdatedAt(Date.now());
      return;
    }

    // 中断は利用者起因なのでエラー表示しない
    if (result.error.kind !== 'aborted') {
      setError(result.error);
    }
  }, [fetcher, all, cwd]);

  useEffect(() => {
    mountedRef.current = true;
    void load();

    if (!poll) {
      return () => {
        mountedRef.current = false;
        abortRef.current?.abort();
      };
    }

    const timer = setInterval(() => {
      void load();
    }, Math.max(intervalMs, MIN_INTERVAL_MS));

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [load, intervalMs, poll]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { agents, previousAgents, error, lastUpdatedAt, isFetching, refresh };
};
