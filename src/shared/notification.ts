import type { TransitionEvent } from '../types/agent.js';

/** OS 通知の内容。発火手段（osascript / Electron）には依存しない。 */
export interface NotificationPayload {
  readonly title: string;
  readonly message: string;
  readonly subtitle?: string | undefined;
}

/** 遷移イベントから通知内容を組み立てる。通知不要なら null を返す。 */
export const toNotification = (event: TransitionEvent): NotificationPayload | null => {
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
