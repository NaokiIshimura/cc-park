import { useEffect, useRef } from 'react';
import { toNotification, type NotificationPayload } from '../shared/notification.js';
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
}

/** 遷移イベントを監視して OS 通知を発火する。 */
export const useNotifications = (
  transitions: readonly TransitionEvent[],
  options: UseNotificationsOptions,
): void => {
  const { enabled, notifier } = options;
  const lastNotifiedRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    for (const event of transitions) {
      const notification = toNotification(event);
      if (notification === null) {
        continue;
      }

      const key = `${event.sessionId}:${event.to}`;
      const lastAt = lastNotifiedRef.current.get(key);
      if (lastAt !== undefined && event.at - lastAt < DEBOUNCE_MS) {
        continue;
      }

      lastNotifiedRef.current.set(key, event.at);
      notifier(notification);
    }
  }, [transitions, enabled, notifier]);
};
