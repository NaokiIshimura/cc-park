import { execFile } from 'node:child_process';
import type { NotificationPayload } from '../shared/notification.js';

/** 通知内容。UI 非依存の共有定義をそのまま使う。 */
export type NotifyOptions = NotificationPayload;

/** 外部コマンド実行の抽象。テストで差し替えられるようにしている。 */
export type NotifyRunner = (command: string, args: readonly string[]) => void;

/** execFile ベースの既定ランナー。 */
export const execFileNotifyRunner: NotifyRunner = (command, args) => {
  // 失敗しても TUI を止めないため、エラーは握り潰す
  execFile(command, [...args], () => undefined);
};

/**
 * AppleScript の文字列リテラルとして安全な形に整形する。
 * バックスラッシュとダブルクォートをエスケープし、改行は空白へ潰す。
 */
export const escapeAppleScriptString = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ');

/** osascript に渡すスクリプト本体を組み立てる。 */
export const buildNotifyScript = (options: NotifyOptions): string => {
  const parts = [
    `display notification "${escapeAppleScriptString(options.message)}"`,
    `with title "${escapeAppleScriptString(options.title)}"`,
  ];
  if (options.subtitle !== undefined && options.subtitle !== '') {
    parts.push(`subtitle "${escapeAppleScriptString(options.subtitle)}"`);
  }
  return parts.join(' ');
};

/** macOS 通知を表示する。macOS 以外では何もしない。 */
export const notify = (
  options: NotifyOptions,
  deps: { readonly platform?: NodeJS.Platform; readonly runner?: NotifyRunner } = {},
): boolean => {
  const platform = deps.platform ?? process.platform;
  if (platform !== 'darwin') {
    return false;
  }

  const runner = deps.runner ?? execFileNotifyRunner;
  runner('osascript', ['-e', buildNotifyScript(options)]);
  return true;
};
