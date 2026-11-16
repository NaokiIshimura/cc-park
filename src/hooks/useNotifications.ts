import { useEffect, useRef } from 'react';
import {
  NOTIFY_SETTLE_MS,
  notificationKindOf,
  settlesBeforeNotify,
  toNotification,
  type NotificationPayload,
} from '../shared/notification.js';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  nextWorkingSince,
  shouldNotify,
  withSound,
  type NotificationSettings,
  type WorkingSince,
} from '../shared/notificationSettings.js';
import type { TransitionEvent } from '../types/agent.js';

// 既存の import 互換のため再輸出する
export { toNotification };

/** 同一セッション・同一遷移の連続通知を抑制する時間 */
const DEBOUNCE_MS = 3000;

export interface UseNotificationsOptions {
  readonly enabled: boolean;
  /**
   * 通知の発火手段。
   *
   * TUI は osascript、GUI は Electron の Notification と実装が異なるため、
   * `node:*` に依存する既定実装を静的 import せず、呼び出し側から注入させる。
   */
  readonly notifier: (payload: NotificationPayload) => void;
  /** どの遷移を通知するか。省略時はすべて通知する（設定画面の無い CLI） */
  readonly settings?: NotificationSettings;
  /** 完了の状態がどれだけ続いたら通知するか。省略時は {@link NOTIFY_SETTLE_MS} */
  readonly settleMs?: number;
}

/** 状態が続くのを待っている完了の通知。 */
interface PendingNotification {
  readonly event: TransitionEvent;
  /** 完了する前の、作業を始めた時刻。作業へ戻ったら、作業が続いていたものとしてこれに戻す */
  readonly since: number | undefined;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * 遷移イベントを監視して OS 通知を発火する。
 *
 * 承認待ちはすぐ通知する。作業完了とバックグラウンドの完了は、その状態が `settleMs` 続いたときだけ通知する。
 * 待つ間に作業へ戻ったら通知を取りやめ、作業は途切れずに続いていたものとして扱う。
 */
export const useNotifications = (
  transitions: readonly TransitionEvent[],
  options: UseNotificationsOptions,
): void => {
  const {
    enabled,
    notifier,
    settings = DEFAULT_NOTIFICATION_SETTINGS,
    settleMs = NOTIFY_SETTLE_MS,
  } = options;
  const lastNotifiedRef = useRef<Map<string, number>>(new Map());
  // 作業を始めた時刻。通知を切っている間も追い、ON に戻した直後の判定を誤らないようにする
  const workingSinceRef = useRef<WorkingSince>(new Map());
  // 処理済みの遷移。通知の ON / OFF や設定を変えただけで、同じ遷移を通知し直さないようにする
  const handledRef = useRef<readonly TransitionEvent[] | null>(null);
  // 状態が続くのを待っている完了の通知（sessionId → 通知）
  const pendingRef = useRef<Map<string, PendingNotification>>(new Map());
  // 設定は最新の値を読めればよく、変わっても遷移を処理し直す理由にはならない
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // 待っていた通知を出すときに、その時点の ON / OFF と発火手段を使う
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const notifierRef = useRef(notifier);
  notifierRef.current = notifier;

  useEffect(() => {
    if (handledRef.current === transitions) {
      return;
    }
    handledRef.current = transitions;

    const pending = pendingRef.current;
    // 完了を待っている間に状態が変わったら、通知を取りやめる
    const resumed = new Map<string, number | undefined>();
    for (const event of transitions) {
      const waiting = pending.get(event.sessionId);
      if (waiting === undefined || waiting.event.to === event.to) {
        continue;
      }
      clearTimeout(waiting.timer);
      pending.delete(event.sessionId);
      if (event.to === 'working') {
        resumed.set(event.sessionId, waiting.since);
      }
    }

    const workingSince = workingSinceRef.current;
    workingSinceRef.current = restoreWorkingSince(
      nextWorkingSince(workingSince, transitions),
      resumed,
    );

    const deliver = (event: TransitionEvent, notification: NotificationPayload): void => {
      const key = `${event.sessionId}:${event.to}`;
      const lastAt = lastNotifiedRef.current.get(key);
      if (lastAt !== undefined && event.at - lastAt < DEBOUNCE_MS) {
        return;
      }
      lastNotifiedRef.current.set(key, event.at);
      notifierRef.current(withSound(notification, settingsRef.current));
    };

    for (const event of transitions) {
      const kind = notificationKindOf(event);
      if (kind === undefined) {
        continue;
      }
      const notification =
        enabled && shouldNotify(event, settingsRef.current, workingSince)
          ? toNotification(event)
          : null;

      if (!settlesBeforeNotify(kind)) {
        if (notification !== null) {
          deliver(event, notification);
        }
        continue;
      }

      // 通知しない完了（通知を切っている・作業が短い）も待つ。
      // 作業へ戻ったときに、作業を始めた時刻を完了前の値へ戻すため
      const timer = setTimeout(() => {
        pending.delete(event.sessionId);
        // 待っている間に通知を切ったら出さない
        if (notification !== null && enabledRef.current) {
          deliver(event, notification);
        }
      }, settleMs);
      pending.set(event.sessionId, {
        event,
        since: workingSince.get(event.sessionId),
        timer,
      });
    }
  }, [transitions, enabled, notifier, settleMs]);

  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      for (const { timer } of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    };
  }, []);
};

/**
 * 完了をはさんで作業へ戻ったセッションの、作業を始めた時刻を完了前の値へ戻す。
 * 完了前の時刻が分からない（cc-park の起動前から作業中だった）なら、分からないままにする。
 */
const restoreWorkingSince = (
  current: WorkingSince,
  resumed: ReadonlyMap<string, number | undefined>,
): WorkingSince => {
  if (resumed.size === 0) {
    return current;
  }
  const next = new Map(current);
  for (const [sessionId, since] of resumed) {
    if (since === undefined) {
      next.delete(sessionId);
    } else {
      next.set(sessionId, since);
    }
  }
  return next;
};
