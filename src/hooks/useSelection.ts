import { useCallback } from 'react';
import { useApp, useInput } from 'ink';
import { copyToClipboard } from '../core/clipboard.js';
import { killAgent } from '../core/killAgent.js';
import { stopAgent } from '../core/stopAgent.js';
import type { Agent } from '../types/agent.js';
import {
  useSelectionCore,
  type PendingAction,
  type SelectionCommand,
} from './useSelectionCore.js';

export interface UseSelectionOptions {
  readonly agents: readonly Agent[];
  readonly onRefresh: () => void;
  /** 通知を切り替え、切り替え後に有効かどうかを返す */
  readonly onToggleNotify: () => boolean;
  /** 実行環境が OS 通知に対応しているか */
  readonly notifySupported?: boolean;
  /** 非 TTY 環境などでキー入力を受け付けない場合に false */
  readonly enabled?: boolean;
  readonly copy?: typeof copyToClipboard;
  readonly stop?: typeof stopAgent;
  readonly kill?: typeof killAgent;
}

export interface UseSelectionResult {
  readonly selectedIndex: number;
  readonly selectedSessionId: string | null;
  /** 直近の操作結果メッセージ（フッタに表示する） */
  readonly message: string | null;
  /** 確認待ちの操作。待機中でなければ null */
  readonly pendingAction: PendingAction | null;
}

type InkKey = Parameters<Parameters<typeof useInput>[0]>[1];

/** 端末のキー入力を操作の意味へ読み替える。 */
export const toSelectionCommand = (input: string, key: InkKey): SelectionCommand => {
  if (key.upArrow || input === 'k') {
    return 'up';
  }
  if (key.downArrow || input === 'j') {
    return 'down';
  }
  // Ctrl+C は Ink 側が終了として処理するため、コピーとは衝突しない
  if (key.return || (input === 'c' && !key.ctrl)) {
    return 'copy';
  }
  if (input === 'r') {
    return 'refresh';
  }
  if (input === 'n') {
    return 'toggleNotify';
  }
  if (input === 's') {
    return 'requestStop';
  }
  if (input === 'x') {
    return 'requestKill';
  }
  if (input === 'q') {
    return 'quit';
  }
  if (input === 'y') {
    return 'confirm';
  }
  return 'other';
};

/** カーソル移動とキーバインドを扱う（TUI 用の入力配線）。 */
export const useSelection = (options: UseSelectionOptions): UseSelectionResult => {
  const {
    agents,
    onRefresh,
    onToggleNotify,
    notifySupported = true,
    enabled = true,
    copy = copyToClipboard,
    stop = stopAgent,
    kill = killAgent,
  } = options;
  const { exit } = useApp();

  const { selectedIndex, selectedSessionId, message, pendingAction, run } = useSelectionCore({
    agents,
    onRefresh,
    onToggleNotify,
    onExit: exit,
    notifySupported,
    copy,
    stop,
    kill,
  });

  const handleKey = useCallback(
    (input: string, key: InkKey) => {
      run(toSelectionCommand(input, key));
    },
    [run],
  );

  useInput(
    (input, key) => {
      // キーを押しっぱなしにすると複数文字がまとめて届くことがあるため 1 文字ずつ処理する
      const isPlainInput =
        input.length > 1 && !key.upArrow && !key.downArrow && !key.return && !key.ctrl && !key.meta;

      if (isPlainInput) {
        for (const character of input) {
          handleKey(character, key);
        }
        return;
      }

      handleKey(input, key);
    },
    { isActive: enabled },
  );

  return { selectedIndex, selectedSessionId, message, pendingAction };
};
