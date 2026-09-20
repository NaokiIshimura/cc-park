import { useEffect, useRef } from 'react';
import { notify, type NotifyOptions } from '../core/notify.js';
import type { TransitionEvent } from '../types/agent.js';

/** 同一セッション・同一遷移の連続通知を抑制する時間 */
const DEBOUNCE_MS = 3000;

/** 遷移イベントから通知内容を組み立てる。通知不要なら null を返す。 */
export const toNotification = (event: TransitionEvent): NotifyOptions | null => {
  // 新規出現（from が null）は起動直後の通知洪水になるため対象外
  if (event.from === null) {
    return null;
  }

  if (event.from === 'working' && event.to === 'waiting') {
    return {
      title: '[完了] Claude Code',
      message: `${event.name} が入力待ちになりました`,
    };
  }
  if (event.to === 'blocked') {
    return {
      title: '[承認待ち] Claude Code',
      message: `${event.name} が承認を待っています`,
    };
  }
  if (event.to === 'done') {
    return {
      title: '[完了] Claude Code',
      message: `バックグラウンド ${event.name} が完了しました`,
    };
  }
  return null;
};

export interface UseNotificationsOptions {
  readonly enabled: boolean;
  readonly notifier?: typeof notify;
}

/** 遷移イベントを監視して OS 通知を発火する。 */
export const useNotifications = (
  transitions: readonly TransitionEvent[],
  options: UseNotificationsOptions,
): void => {
  const { enabled, notifier = notify } = options;
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
