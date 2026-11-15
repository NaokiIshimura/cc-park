import type { FetchAgentsResult } from '../core/fetchAgents.js';
import type { FocusSessionResult } from '../core/focusSession.js';
import type { KillAgentResult } from '../core/killAgent.js';
import type { StopAgentResult } from '../core/stopAgent.js';
import type { ScheduleFiredEvent } from '../core/scheduler.js';
import type { AttentionCounts, AttentionSettings } from '../shared/attention.js';
import type { CompactSettings } from '../shared/compactSettings.js';
import type { NotificationPayload } from '../shared/notification.js';
import type { NotificationSettings } from '../shared/notificationSettings.js';
import type { OpenSettings } from '../shared/openSettings.js';
import type { Schedule } from '../shared/schedule.js';
import type { Appearance } from '../shared/themes.js';
import type { ScheduledLaunch } from '../shared/scheduledLaunch.js';
import type { Agent } from '../types/agent.js';
import type { Size } from './compact.js';
import type { GuiConfig } from './config.js';
import type { WindowPosition } from './windowPosition.js';

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
  /** セッションの画面（端末のタブ・アプリ）を前面に出す */
  focusSession: 'agents:focus',
  /** クリップボードへの書き込み */
  writeClipboard: 'clipboard:write',
  /** ウィンドウの最前面固定の切り替え */
  setAlwaysOnTop: 'window:alwaysOnTop',
  /** ウィンドウを画面の四隅・中央へ順に動かす（← / →） */
  moveWindow: 'window:move',
  /** 見た目（配色テーマ・強調色）の変更と保存 */
  setAppearance: 'appearance:set',
  /** ウィンドウの不透明度の変更 */
  setOpacity: 'window:opacity',
  /** ミニ表示への切り替え（ウィンドウの大きさの変更） */
  setCompact: 'window:compact',
  /** ミニ表示の設定の保存 */
  saveCompactSettings: 'compact:save',
  /** 操作待ちの件数の通達（renderer → main）。Dock のバッジとメニューバーに出す */
  setAttention: 'attention:set',
  /** 操作待ちの件数の出し方の変更と保存 */
  saveAttentionSettings: 'attention:save',
  /** 通知の条件の変更と保存 */
  saveNotificationSettings: 'notification:save',
  /** 起動元のアプリが分からないセッションを開くアプリの変更と保存 */
  saveOpenSettings: 'open:save',
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
  /** 予約を今すぐ実行する */
  runSchedule: 'schedule:run',
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
  /** セッションの画面（端末のタブ・アプリ）を前面に出す。移動できなければ理由を返す */
  readonly focusSession: (agent: Agent) => Promise<FocusSessionResult>;
  readonly writeClipboard: (text: string) => Promise<boolean>;
  /** ウィンドウを最前面に固定する / 解除する。適用後の状態を返す */
  readonly setAlwaysOnTop: (value: boolean) => Promise<boolean>;
  /**
   * ウィンドウを画面の四隅・中央へ順に動かす。`step` は 1 で次（→）、-1 で前（←）。
   * 動かした先を返し、動かせなければ null
   */
  readonly moveWindow: (step: 1 | -1) => Promise<WindowPosition | null>;
  /** ウィンドウの不透明度（0〜1）を変える。適用後の値を返す */
  readonly setOpacity: (value: number) => Promise<number>;
  /**
   * ミニ表示へ畳む / 通常表示へ戻す。適用後にミニ表示かどうかを返す。
   * 畳むときは renderer が実測した内容の大きさを渡し、ウィンドウをその大きさに合わせる。
   */
  readonly setCompact: (compact: boolean, size: Size | null) => Promise<boolean>;
  /**
   * ミニ表示の ON / OFF と並びを保存し、次回の起動時に同じ表示から再開させる。保存した値を返す。
   * 予約画面などで一時的に広げたときは呼ばない（`setCompact` とは別にしているのはこのため）。
   */
  readonly saveCompactSettings: (settings: CompactSettings) => Promise<CompactSettings>;
  /**
   * 見た目を変更して保存する。適用後の値を返す。
   * OS 部品の明暗（`nativeTheme`）は main でしか変えられないため、変更のたびに呼ぶ。
   */
  readonly setAppearance: (appearance: Appearance) => Promise<Appearance>;
  /**
   * 操作待ちの件数を main へ知らせる。Dock のバッジとメニューバーに出す。
   * `DONE!` は renderer の遷移検出で決まるため、件数は renderer が数えて渡す。
   */
  readonly setAttention: (counts: AttentionCounts) => void;
  /** 件数を Dock のバッジ・メニューバーに出すかを変更して保存する。適用後の値を返す */
  readonly saveAttentionSettings: (settings: AttentionSettings) => Promise<AttentionSettings>;
  /** どの遷移を OS 通知するかを変更して保存する。保存した値を返す */
  readonly saveNotificationSettings: (
    settings: NotificationSettings,
  ) => Promise<NotificationSettings>;
  /** 起動元のアプリが分からないセッションを開くアプリを変更して保存する。保存した値を返す */
  readonly saveOpenSettings: (settings: OpenSettings) => Promise<OpenSettings>;
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
  /**
   * 予約を今すぐ実行する。結果は {@link onScheduleFired} にも届く。
   * 知らない ID か、同じ予約を実行している途中なら null
   */
  readonly runSchedule: (id: string) => Promise<ScheduleFiredEvent | null>;
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
