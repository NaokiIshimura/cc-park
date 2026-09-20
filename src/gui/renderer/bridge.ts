import type { FetchAgentsOptions, FetchAgentsResult } from '../../core/fetchAgents.js';
import type { CcParkBridge } from '../ipc.js';

/**
 * `useAgents` へ注入する取得関数を作る。
 *
 * `AbortSignal` は IPC を越えられないため無視し、中断相当の制御は main 側の
 * タイムアウトに委ねる（多重実行のガードは `useAgents` が renderer 側で行う）。
 */
export const createBridgeFetcher =
  (bridge: CcParkBridge) =>
  (options: FetchAgentsOptions): Promise<FetchAgentsResult> =>
    bridge.fetchAgents({ all: options.all ?? false, cwd: options.cwd });
