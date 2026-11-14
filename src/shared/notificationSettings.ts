import type { TransitionEvent } from '../types/agent.js';
import { notificationKindOf, type NotificationPayload } from './notification.js';

/**
 * OS 通知の条件。
 *
 * 通知そのものの ON / OFF（ヘッダの `notify` トグル・`n` キー・`--no-notify`）とは別に、
 * どの遷移を通知するかを細かく選ぶ。短い作業の完了まで通知されてうるさい、といった調整に使う。
 * renderer（設定画面）・main（保存）・hooks（判断）のいずれからも使うため、UI に依存しない値と判定だけを置く。
 */

export interface NotificationSettings {
  /** 承認待ち（`*` → `BLOCKED`） */
  readonly blocked: boolean;
  /** 作業完了（`BUSY` → `IDLE`） */
  readonly finished: boolean;
  /** バックグラウンドの完了（`*` → `DONE`） */
  readonly done: boolean;
  /**
   * 作業完了を通知する最短の作業時間（秒）。0 ならすべて通知する。
   * 作業を始めた時刻が分からない（cc-park の起動前から作業中だった）ときは通知する。
   */
  readonly minWorkSeconds: number;
  /** 通知音を鳴らす（GUI のみ。CLI の osascript の通知は元から鳴らない） */
  readonly sound: boolean;
}

/** 既定ではこれまでどおり、すべての遷移を音付きで通知する。 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  blocked: true,
  finished: true,
  done: true,
  minWorkSeconds: 0,
  sound: true,
};

/** 設定画面で選べる最短の作業時間（秒）。 */
export const MIN_WORK_SECONDS_OPTIONS: readonly number[] = [0, 30, 60, 180, 300, 600];

/** 最短の作業時間を `30 秒` / `5 分` のような表示にする。 */
export const formatMinWork = (seconds: number): string => {
  if (seconds === 0) {
    return 'すべて';
  }
  return seconds < 60 ? `${seconds} 秒以上` : `${seconds / 60} 分以上`;
};

/** 作業を始めた時刻（sessionId → epoch ms）。 */
export type WorkingSince = ReadonlyMap<string, number>;

/**
 * 遷移から、各セッションが作業を始めた時刻を更新する。
 * 作業中へ入ったら記録し、作業中から出たら消す（出た遷移の判定に使ってから消すこと）。
 */
export const nextWorkingSince = (
  current: WorkingSince,
  events: readonly TransitionEvent[],
): WorkingSince => {
  if (events.length === 0) {
    return current;
  }
  const next = new Map(current);
  for (const event of events) {
    if (event.to === 'working') {
      next.set(event.sessionId, event.at);
    } else if (event.from === 'working') {
      next.delete(event.sessionId);
    }
  }
  return next;
};

/** 遷移を通知するか。`workingSince` は、この遷移を反映する前の値を渡す。 */
export const shouldNotify = (
  event: TransitionEvent,
  settings: NotificationSettings,
  workingSince: WorkingSince,
): boolean => {
  const kind = notificationKindOf(event);
  if (kind === undefined || !settings[kind]) {
    return false;
  }
  if (kind !== 'finished' || settings.minWorkSeconds === 0) {
    return true;
  }
  const since = workingSince.get(event.sessionId);
  // 始めた時刻が分からないものは、短い作業と決めつけずに通知する
  return since === undefined || event.at - since >= settings.minWorkSeconds * 1000;
};

/** 通知音の設定を通知内容に反映する。 */
export const withSound = (
  payload: NotificationPayload,
  settings: NotificationSettings,
): NotificationPayload => (settings.sound ? payload : { ...payload, silent: true });

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/**
 * 保存ファイルや renderer から来た値を設定として解釈する。
 * 解釈できない項目は既定値で埋める（この設定を持たない古い保存ファイルは既定として読む）。
 */
export const toNotificationSettings = (value: unknown): NotificationSettings => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
  const record = value as Partial<Record<keyof NotificationSettings, unknown>>;
  const pick = (key: 'blocked' | 'finished' | 'done' | 'sound'): boolean => {
    const candidate = record[key];
    return isBoolean(candidate) ? candidate : DEFAULT_NOTIFICATION_SETTINGS[key];
  };
  const { minWorkSeconds } = record;
  return {
    blocked: pick('blocked'),
    finished: pick('finished'),
    done: pick('done'),
    minWorkSeconds:
      typeof minWorkSeconds === 'number' && Number.isInteger(minWorkSeconds) && minWorkSeconds >= 0
        ? minWorkSeconds
        : DEFAULT_NOTIFICATION_SETTINGS.minWorkSeconds,
    sound: pick('sound'),
  };
};
