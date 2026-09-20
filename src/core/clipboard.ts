import { spawn } from 'node:child_process';
import { buildResumeCommand } from '../shared/resumeCommand.js';

// 既存の import 互換のため再輸出する
export { buildResumeCommand };

/** 外部コマンド実行の抽象。テストで差し替えられるようにしている。 */
export type ClipboardWriter = (text: string) => void;

/**
 * 指定コマンドの標準入力へ書き込むライターを作る。
 * 既定では macOS の pbcopy を使う。
 */
export const createCommandWriter =
  (command: string): ClipboardWriter =>
  (text) => {
    const child = spawn(command);
    // コマンドが無い環境でも TUI を落とさない
    child.on('error', () => undefined);
    child.stdin.end(text);
  };

const defaultWriter = createCommandWriter('pbcopy');

/** テキストをクリップボードへコピーする。macOS 以外では何もしない。 */
export const copyToClipboard = (
  text: string,
  deps: { readonly platform?: NodeJS.Platform; readonly writer?: ClipboardWriter } = {},
): boolean => {
  const platform = deps.platform ?? process.platform;
  if (platform !== 'darwin') {
    return false;
  }

  const writer = deps.writer ?? defaultWriter;
  writer(text);
  return true;
};
