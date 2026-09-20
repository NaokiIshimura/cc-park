import type { FetchAgentsResult } from '../core/fetchAgents.js';
import type { KillAgentResult } from '../core/killAgent.js';
import type { StopAgentResult } from '../core/stopAgent.js';
import type { NotificationPayload } from '../shared/notification.js';
import type { Agent } from '../types/agent.js';
import type { GuiConfig } from './config.js';

/**
 * main / preload / renderer で共有する IPC チャンネル名。
 * 文字列を直接書かず、ここだけを参照する。
 */
export const IPC_CHANNELS = {
  /** 起動時設定の取得 */
  getConfig: 'config:get',
  /** セッション一覧の取得 */
  fetchAgents: 'agents:fetch',
  /** background セッションの停止 */
  stopAgent: 'agents:stop',
  /** セッションの OS プロセスへシグナルを送る */
  killAgent: 'agents:kill',
  /** クリップボードへの書き込み */
  writeClipboard: 'clipboard:write',
  /** ウィンドウの最前面固定の切り替え */
  setAlwaysOnTop: 'window:alwaysOnTop',
  /** OS 通知の表示 */
  notify: 'notify:show',
  /** アプリの終了 */
  quit: 'app:quit',
} as const;

/** 一覧取得のリクエスト。`AbortSignal` は IPC を越えられないため含めない。 */
export interface FetchAgentsRequest {
  readonly all: boolean;
  readonly cwd: string | undefined;
}

/** preload が `window.ccPark` として公開する API。 */
export interface CcParkBridge {
  readonly getConfig: () => Promise<GuiConfig>;
  readonly fetchAgents: (request: FetchAgentsRequest) => Promise<FetchAgentsResult>;
  readonly stopAgent: (agent: Agent) => Promise<StopAgentResult>;
  readonly killAgent: (agent: Agent) => Promise<KillAgentResult>;
  readonly writeClipboard: (text: string) => Promise<boolean>;
  /** ウィンドウを最前面に固定する / 解除する。適用後の状態を返す */
  readonly setAlwaysOnTop: (value: boolean) => Promise<boolean>;
  readonly notify: (payload: NotificationPayload) => void;
  readonly quit: () => void;
}
