import { useCallback, useEffect } from 'react';
import {
  useSelectionCore,
  type CopyText,
  type SelectionCommand,
  type UseSelectionCoreResult,
} from '../../../hooks/useSelectionCore.js';
import type { KillAgentResult } from '../../../core/killAgent.js';
import type { StopAgentResult } from '../../../core/stopAgent.js';
import type { Agent } from '../../../types/agent.js';

/**
 * GUI で扱う操作。共有の状態機械が知る操作に、GUI 固有のものを足したもの。
 * `toggleAlwaysOnTop` はウィンドウを持つ GUI にしかない概念なので core には置かない。
 */
export type GuiCommand = SelectionCommand | 'toggleAlwaysOnTop';

/** キー入力のうち判定に使う部分だけを取り出した型。 */
export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/**
 * DOM のキー入力を操作の意味へ読み替える。
 * 割り当ての無い印字文字は `other`（＝確認待ちの取消）、それ以外は null（無視）。
 */
export const toGuiSelectionCommand = (event: KeyInput): GuiCommand | null => {
  // Cmd+W / Ctrl+C などアプリ・OS のショートカットを横取りしない
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }

  switch (event.key) {
    case 'ArrowUp':
    case 'k':
      return 'up';
    case 'ArrowDown':
    case 'j':
      return 'down';
    case 'c':
      return 'copy';
    case 'r':
      return 'refresh';
    case 'n':
      return 'toggleNotify';
    case 's':
      return 'requestStop';
    case 'x':
      return 'requestKill';
    case 't':
      return 'toggleAlwaysOnTop';
    case 'q':
      return 'quit';
    case 'y':
      return 'confirm';
    case 'Escape':
      return 'cancel';
    default:
      // Shift や Tab のような装飾キーは無視し、印字文字だけを入力として扱う
      return event.key.length === 1 ? 'other' : null;
  }
};

/** ボタン上の Enter / Space はボタン自身の操作なので、一覧の操作としては扱わない。 */
export const isControlActivation = (key: string, target: EventTarget | null): boolean =>
  (key === 'Enter' || key === ' ') &&
  target instanceof HTMLElement &&
  target.tagName === 'BUTTON';

export interface UseGuiSelectionOptions {
  readonly agents: readonly Agent[];
  readonly onRefresh: () => void;
  /** 通知を切り替え、切り替え後に有効かどうかを返す */
  readonly onToggleNotify: () => boolean;
  /** アプリを終了する */
  readonly onExit: () => void;
  /** 最前面固定を切り替え、切り替え後に固定されているかを返す */
  readonly onToggleAlwaysOnTop: () => boolean | Promise<boolean>;
  readonly copy: CopyText;
  readonly stop: (agent: Agent) => Promise<StopAgentResult>;
  readonly kill: (agent: Agent) => Promise<KillAgentResult>;
  /** false の場合はキー入力を受け付けない */
  readonly enabled?: boolean;
}

export interface UseGuiSelectionResult extends UseSelectionCoreResult {
  /** 最前面固定の切り替え（キー操作・ヘッダのトグルの双方から使う） */
  readonly toggleAlwaysOnTop: () => void;
}

/**
 * カーソル移動とキーバインドを扱う（GUI 用の入力配線）。
 * 判断ロジックは TUI と共通の `useSelectionCore` に委ね、ここは入力源の差だけを吸収する。
 */
export const useGuiSelection = (options: UseGuiSelectionOptions): UseGuiSelectionResult => {
  const {
    agents,
    onRefresh,
    onToggleNotify,
    onExit,
    onToggleAlwaysOnTop,
    copy,
    stop,
    kill,
    enabled = true,
  } = options;

  const core = useSelectionCore({
    agents,
    onRefresh,
    onToggleNotify,
    onExit,
    // Electron の通知・クリップボードはプラットフォームを問わず使える
    notifySupported: true,
    copy,
    stop,
    kill,
  });

  const { run, setMessage, pendingAction } = core;

  const toggleAlwaysOnTop = useCallback(() => {
    // 押したときにどちらへ切り替わったかがわかるようメッセージを出す
    void Promise.resolve(onToggleAlwaysOnTop()).then((enabledNow) => {
      setMessage(enabledNow ? '最前面に固定しました' : '最前面固定を解除しました');
    });
  }, [onToggleAlwaysOnTop, setMessage]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isControlActivation(event.key, event.target)) {
        return;
      }
      const command = toGuiSelectionCommand(event);
      if (command === null) {
        return;
      }

      if (command === 'toggleAlwaysOnTop') {
        // 確認待ち中は他キーと同様に取消として消費し、誤操作を防ぐ
        if (pendingAction !== null) {
          run('cancel');
          return;
        }
        toggleAlwaysOnTop();
        return;
      }

      run(command);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [run, enabled, pendingAction, toggleAlwaysOnTop]);

  return { ...core, toggleAlwaysOnTop };
};
