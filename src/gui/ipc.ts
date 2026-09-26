import type { FetchAgentsResult } from '../core/fetchAgents.js';
import type { KillAgentResult } from '../core/killAgent.js';
import type { StopAgentResult } from '../core/stopAgent.js';
import type { ScheduleFiredEvent } from '../core/scheduler.js';
import type { NotificationPayload } from '../shared/notification.js';
import type { Schedule } from '../shared/schedule.js';
import type { ScheduledLaunch } from '../shared/scheduledLaunch.js';
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
  /** ディレクトリ選択ダイアログの表示 */
  pickDirectory: 'dialog:pickDirectory',
  /** 予約一覧の取得 */
  listSchedules: 'schedule:list',
  /** 予約の追加・更新 */
  saveSchedule: 'schedule:save',
  /** 予約の削除 */
  deleteSchedule: 'schedule:delete',
  /** 予約の有効 / 無効の切り替え */
  setScheduleEnabled: 'schedule:setEnabled',
  /** 予約から起動したセッションの記録の取得 */
  listScheduledLaunches: 'schedule:listLaunches',
  /** 予約が発火したことの通達（main → renderer） */
  scheduleFired: 'schedule:fired',
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
  /**
   * ディレクトリ選択ダイアログを開く。選ばれた絶対パスを返し、取り消したら null。
   * `defaultPath` は最初に開く場所（空文字なら OS に任せる）。
   */
  readonly pickDirectory: (defaultPath: string) => Promise<string | null>;
  readonly listSchedules: () => Promise<Schedule[]>;
  /** 予約を追加・更新し、更新後の一覧を返す */
  readonly saveSchedule: (schedule: Schedule) => Promise<Schedule[]>;
  readonly deleteSchedule: (id: string) => Promise<Schedule[]>;
  readonly setScheduleEnabled: (id: string, enabled: boolean) => Promise<Schedule[]>;
  /** 予約から起動したセッションの記録。一覧で見分けるために使う */
  readonly listScheduledLaunches: () => Promise<ScheduledLaunch[]>;
  /**
   * 予約の発火を購読する。購読を解除する関数を返す。
   * 発火は main 側のタイマーで起こるため、renderer からは待ち受けるしかない。
   */
  readonly onScheduleFired: (listener: (event: ScheduleFiredEvent) => void) => () => void;
  readonly notify: (payload: NotificationPayload) => void;
  readonly quit: () => void;
}
