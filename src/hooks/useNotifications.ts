import { useEffect, useRef } from 'react';
import { toNotification, type NotificationPayload } from '../shared/notification.js';
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
}

/** 遷移イベントを監視して OS 通知を発火する。 */
export const useNotifications = (
  transitions: readonly TransitionEvent[],
  options: UseNotificationsOptions,
): void => {
  const { enabled, notifier, settings = DEFAULT_NOTIFICATION_SETTINGS } = options;
  const lastNotifiedRef = useRef<Map<string, number>>(new Map());
  // 作業を始めた時刻。通知を切っている間も追い、ON に戻した直後の判定を誤らないようにする
  const workingSinceRef = useRef<WorkingSince>(new Map());
  // 処理済みの遷移。通知の ON / OFF や設定を変えただけで、同じ遷移を通知し直さないようにする
  const handledRef = useRef<readonly TransitionEvent[] | null>(null);
  // 設定は最新の値を読めればよく、変わっても遷移を処理し直す理由にはならない
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (handledRef.current === transitions) {
      return;
    }
    handledRef.current = transitions;

    const workingSince = workingSinceRef.current;
    workingSinceRef.current = nextWorkingSince(workingSince, transitions);

    if (!enabled) {
      return;
    }

    for (const event of transitions) {
      const notification = toNotification(event);
      if (notification === null || !shouldNotify(event, settingsRef.current, workingSince)) {
        continue;
      }

      const key = `${event.sessionId}:${event.to}`;
      const lastAt = lastNotifiedRef.current.get(key);
      if (lastAt !== undefined && event.at - lastAt < DEBOUNCE_MS) {
        continue;
      }

      lastNotifiedRef.current.set(key, event.at);
      notifier(withSound(notification, settingsRef.current));
    }
  }, [transitions, enabled, notifier]);
};
