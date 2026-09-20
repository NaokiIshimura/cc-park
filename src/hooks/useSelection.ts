import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, useInput } from 'ink';
import { buildResumeCommand, copyToClipboard } from '../core/clipboard.js';
import { canStop, stopAgent, stopUnsupportedReason } from '../core/stopAgent.js';
import type { Agent } from '../types/agent.js';

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
}

export interface UseSelectionResult {
  readonly selectedIndex: number;
  readonly selectedSessionId: string | null;
  /** 直近の操作結果メッセージ（フッタに表示する） */
  readonly message: string | null;
  /** stop の確認待ち対象。待機中でなければ null */
  readonly pendingStopSessionId: string | null;
}

/** カーソル移動とキーバインドを扱う。 */
export const useSelection = (options: UseSelectionOptions): UseSelectionResult => {
  const {
    agents,
    onRefresh,
    onToggleNotify,
    notifySupported = true,
    enabled = true,
    copy = copyToClipboard,
    stop = stopAgent,
  } = options;
  const { exit } = useApp();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingStopSessionId, setPendingStopSessionId] = useState<string | null>(null);

  // stop は非同期なので、アンマウント後の setState と二重実行を ref で防ぐ
  const mountedRef = useRef(true);
  const stoppingRef = useRef(false);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // 一覧が縮んだときにカーソルが範囲外へ出ないよう補正する
  useEffect(() => {
    setSelectedIndex((current) => {
      if (agents.length === 0) {
        return 0;
      }
      return Math.min(current, agents.length - 1);
    });
  }, [agents.length]);

  const move = useCallback(
    (delta: number) => {
      setSelectedIndex((current) => {
        if (agents.length === 0) {
          return 0;
        }
        return (current + delta + agents.length) % agents.length;
      });
    },
    [agents.length],
  );

  const copySelected = useCallback(() => {
    const agent = agents[selectedIndex];
    if (agent === undefined) {
      return;
    }
    const command = buildResumeCommand(agent.sessionId);
    const copied = copy(command);
    setMessage(copied ? `コピーしました: ${command}` : `コピー非対応の環境です: ${command}`);
  }, [agents, selectedIndex, copy]);

  const toggleNotify = useCallback(() => {
    if (!notifySupported) {
      setMessage('OS 通知は macOS のみ対応しています');
      return;
    }
    // 押したときにどちらへ切り替わったかがわかるようメッセージを出す
    setMessage(onToggleNotify() ? 'OS 通知を ON にしました' : 'OS 通知を OFF にしました');
  }, [onToggleNotify, notifySupported]);

  /** stop の確認待ちへ入る。停止できない相手なら理由だけ出して何もしない。 */
  const requestStop = useCallback(() => {
    const agent = agents[selectedIndex];
    if (agent === undefined || stoppingRef.current) {
      return;
    }
    if (!canStop(agent)) {
      setMessage(`stop できません: ${stopUnsupportedReason(agent)}`);
      return;
    }
    setPendingStopSessionId(agent.sessionId);
    setMessage(`「${agent.name}」を stop しますか? y で実行 / 他キーで取消`);
  }, [agents, selectedIndex]);

  const confirmStop = useCallback(async () => {
    const agent = agents.find((candidate) => candidate.sessionId === pendingStopSessionId);
    setPendingStopSessionId(null);
    if (agent === undefined) {
      // 確認中に一覧から消えた場合は何もしない
      setMessage('stop 対象が見つかりませんでした');
      return;
    }

    stoppingRef.current = true;
    setMessage(`stop 中: ${agent.name}`);

    const result = await stop(agent);

    stoppingRef.current = false;
    if (!mountedRef.current) {
      return;
    }

    if (result.ok) {
      setMessage(`stop しました: ${agent.name}`);
      // 一覧から消えるのを待たずに反映させる
      onRefresh();
      return;
    }
    setMessage(`stop に失敗しました: ${result.error.message}`);
  }, [agents, pendingStopSessionId, stop, onRefresh]);

  const cancelStop = useCallback(() => {
    setPendingStopSessionId(null);
    setMessage('stop を取り消しました');
  }, []);

  const handleKey = useCallback(
    (input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) => {
      // 確認待ち中は y 以外をすべて取消として消費し、誤操作を防ぐ
      if (pendingStopSessionId !== null) {
        if (input === 'y') {
          void confirmStop();
          return;
        }
        cancelStop();
        return;
      }

      if (key.upArrow || input === 'k') {
        move(-1);
        return;
      }
      if (key.downArrow || input === 'j') {
        move(1);
        return;
      }
      // Ctrl+C は Ink 側が終了として処理するため、コピーとは衝突しない
      if (key.return || (input === 'c' && !key.ctrl)) {
        copySelected();
        return;
      }
      if (input === 'r') {
        onRefresh();
        setMessage('更新しました');
        return;
      }
      if (input === 'n') {
        toggleNotify();
        return;
      }
      if (input === 's') {
        requestStop();
        return;
      }
      if (input === 'q') {
        exit();
      }
    },
    [
      pendingStopSessionId,
      confirmStop,
      cancelStop,
      move,
      copySelected,
      onRefresh,
      toggleNotify,
      requestStop,
      exit,
    ],
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

  return {
    selectedIndex,
    selectedSessionId: agents[selectedIndex]?.sessionId ?? null,
    message,
    pendingStopSessionId,
  };
};
