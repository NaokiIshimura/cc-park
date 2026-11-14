import { useCallback, useRef, useState } from 'react';
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
  /** 「操作待ちだけ表示」を切り替え、切り替え後に絞っているかを返す */
  readonly onToggleFilter?: () => boolean;
  /** 検索語。`/` で入力を始め、Enter で確定、Esc で消す */
  readonly query?: string;
  readonly onQueryChange?: (query: string) => void;
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
  /** 検索語を入力中か */
  readonly searching: boolean;
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
  if (input === 'c' && !key.ctrl) {
    return 'copy';
  }
  if (input === 'r') {
    return 'refresh';
  }
  if (input === 'n') {
    return 'toggleNotify';
  }
  if (input === 'f') {
    return 'toggleFilter';
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
    onToggleFilter,
    query = '',
    onQueryChange,
  } = options;
  const { exit } = useApp();
  const [searching, setSearchingState] = useState(false);
  /*
   * 貼り付けやキーの押しっぱなしでは、`/` と続く文字が 1 回の入力にまとめて届く。
   * state の更新は次の描画まで見えないので、同じ入力の中で切り替えた結果は ref で持つ。
   */
  const searchingRef = useRef(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  const setSearching = useCallback((value: boolean) => {
    searchingRef.current = value;
    setSearchingState(value);
  }, []);

  const changeQuery = useCallback(
    (value: string) => {
      queryRef.current = value;
      onQueryChange?.(value);
    },
    [onQueryChange],
  );

  const { selectedIndex, selectedSessionId, message, pendingAction, run } = useSelectionCore({
    agents,
    onRefresh,
    onToggleNotify,
    onExit: exit,
    ...(onToggleFilter === undefined ? {} : { onToggleFilter }),
    notifySupported,
    copy,
    stop,
    kill,
  });

  /**
   * 検索語の入力中のキー。文字は検索語に足し、一覧の操作には使わない。
   * Enter で確定して一覧の操作へ戻り、Esc で検索語を消して戻る。
   */
  const handleSearchKey = useCallback(
    (input: string, key: InkKey) => {
      if (key.escape) {
        changeQuery('');
        setSearching(false);
        return;
      }
      if (key.return) {
        setSearching(false);
        return;
      }
      if (key.backspace || key.delete) {
        changeQuery([...queryRef.current].slice(0, -1).join(''));
        return;
      }
      if (input !== '' && !key.ctrl && !key.meta) {
        // まとめて届いた入力に改行が含まれていれば、そこまでを足して確定する
        const [text = '', ...afterNewline] = input.split(/[\r\n]/);
        if (text !== '') {
          changeQuery(queryRef.current + text);
        }
        if (afterNewline.length > 0) {
          setSearching(false);
        }
      }
    },
    [changeQuery, setSearching],
  );

  const handleKey = useCallback(
    (input: string, key: InkKey) => {
      if (onQueryChange !== undefined && pendingAction === null) {
        if (input === '/') {
          setSearching(true);
          return;
        }
        // 確定した検索語は Esc で消す
        if (key.escape && queryRef.current !== '') {
          changeQuery('');
          return;
        }
      }
      run(toSelectionCommand(input, key));
    },
    [run, onQueryChange, changeQuery, setSearching, pendingAction],
  );

  useInput(
    (input, key) => {
      if (searchingRef.current) {
        // 貼り付けなどでまとめて届いた文字も、そのまま検索語に足す
        handleSearchKey(input, key);
        return;
      }

      // キーを押しっぱなしにすると複数文字がまとめて届くことがあるため 1 文字ずつ処理する
      const isPlainInput =
        input.length > 1 && !key.upArrow && !key.downArrow && !key.return && !key.ctrl && !key.meta;

      if (isPlainInput) {
        const characters = [...input];
        for (const [index, character] of characters.entries()) {
          // `/` で検索を始めたら、残りの文字は検索語として扱う
          if (searchingRef.current) {
            handleSearchKey(characters.slice(index).join(''), key);
            return;
          }
          handleKey(character, key);
        }
        return;
      }

      handleKey(input, key);
    },
    { isActive: enabled },
  );

  return { selectedIndex, selectedSessionId, message, pendingAction, searching };
};
