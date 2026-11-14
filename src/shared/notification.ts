import type { TransitionEvent } from '../types/agent.js';

/** OS 通知の内容。発火手段（osascript / Electron）には依存しない。 */
export interface NotificationPayload {
  readonly title: string;
  readonly message: string;
  readonly subtitle?: string | undefined;
  /** 通知音を鳴らさない（GUI のみ。CLI の osascript の通知は元から鳴らない） */
  readonly silent?: boolean | undefined;
}

/** 通知の種類。設定（`NotificationSettings`）で種類ごとに ON / OFF できる。 */
export type NotificationKind = 'blocked' | 'finished' | 'done';

/** 遷移がどの種類の通知になるか。通知しない遷移は undefined。 */
export const notificationKindOf = (event: TransitionEvent): NotificationKind | undefined => {
  // 新規出現（from が null）は起動直後の通知洪水になるため対象外
  if (event.from === null) {
    return undefined;
  }
  if (event.from === 'working' && event.to === 'waiting') {
    return 'finished';
  }
  if (event.to === 'blocked') {
    return 'blocked';
  }
  if (event.to === 'done') {
    return 'done';
  }
  return undefined;
};

/** 遷移イベントから通知内容を組み立てる。通知不要なら null を返す。 */
export const toNotification = (event: TransitionEvent): NotificationPayload | null => {
  switch (notificationKindOf(event)) {
    case 'finished':
      return {
        title: '[完了] Claude Code',
        message: `${event.name} が入力待ちになりました`,
      };
    case 'blocked':
      return {
        title: '[承認待ち] Claude Code',
        // 何の承認かが分かれば添え、通知だけで急ぐかどうかを判断できるようにする
        message:
          event.reason === undefined
            ? `${event.name} が承認を待っています`
            : `${event.name} が承認を待っています: ${event.reason}`,
      };
    case 'done':
      return {
        title: '[完了] Claude Code',
        message: `バックグラウンド ${event.name} が完了しました`,
      };
    default:
      return null;
  }
};
