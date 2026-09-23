import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KillAgentResult } from '../core/killAgent.js';
import type { StopAgentResult } from '../core/stopAgent.js';
import { canKill, killUnsupportedReason } from '../shared/killSupport.js';
import { buildResumeCommand } from '../shared/resumeCommand.js';
import { canStop, stopUnsupportedReason } from '../shared/stopSupport.js';
import type { Agent } from '../types/agent.js';

/**
 * 選択状態に対する操作。
 *
 * 入力源（端末のキー入力 / DOM の keydown / クリック）ごとにキーの綴りは違っても
 * 意味は同じなので、意味の側だけをここで受け取る。`other` は「割り当ての無い入力」。
 */
export type SelectionCommand =
  | 'up'
  | 'down'
  | 'copy'
  | 'refresh'
  | 'toggleNotify'
  | 'requestStop'
  | 'requestKill'
  | 'confirm'
  | 'cancel'
  | 'quit'
  | 'other';

/** クリップボードへの書き込み。同期・非同期のどちらでもよい。 */
export type CopyText = (text: string) => boolean | Promise<boolean>;

/** 確認を挟んでから実行する破壊的操作。 */
export type PendingActionKind = 'stop' | 'kill';

export interface PendingAction {
  readonly kind: PendingActionKind;
  readonly sessionId: string;
}

/** stop / kill が返す結果の共通部分。 */
type ActionResult = StopAgentResult | KillAgentResult;

/** 種別ごとの「実行できるか・理由・実行方法」をまとめたもの。 */
interface ActionSpec {
  /** メッセージに使う操作名 */
  readonly label: string;
  readonly can: (agent: Agent) => boolean;
  readonly reason: (agent: Agent) => string;
  readonly run: (agent: Agent) => Promise<ActionResult>;
}

export interface UseSelectionCoreOptions {
  readonly agents: readonly Agent[];
  readonly onRefresh: () => void;
  /** 通知を切り替え、切り替え後に有効かどうかを返す */
  readonly onToggleNotify: () => boolean;
  /** アプリを終了する */
  readonly onExit: () => void;
  /** 実行環境が OS 通知に対応しているか */
  readonly notifySupported: boolean;
  readonly copy: CopyText;
  /** background セッションを `claude stop` で止める */
  readonly stop: (agent: Agent) => Promise<StopAgentResult>;
  /** interactive セッションの OS プロセスへシグナルを送る */
  readonly kill: (agent: Agent) => Promise<KillAgentResult>;
}

export interface UseSelectionCoreResult {
  readonly selectedIndex: number;
  readonly selectedSessionId: string | null;
  /** 直近の操作結果メッセージ（フッタに表示する） */
  readonly message: string | null;
  /** UI 固有の操作からも同じ場所へ結果を出せるようにする */
  readonly setMessage: (message: string) => void;
  /** 確認待ちの操作。待機中でなければ null */
  readonly pendingAction: PendingAction | null;
  /** 入力源から受け取った操作を実行する */
  readonly run: (command: SelectionCommand) => void;
  /** 一覧上の位置を直接指定して選択する（クリック操作用） */
  readonly select: (index: number) => void;
  /** 位置を指定してセッションを開くコマンドをコピーする（ダブルクリック操作用） */
  readonly copyAt: (index: number) => void;
}

/**
 * 選択カーソルと操作の状態機械。
 *
 * ink にも DOM にも依存しないため、TUI と GUI で同じ判断ロジックを共有できる。
 * 入力の解釈（どのキーがどの操作か）だけを呼び出し側が受け持つ。
 */
export const useSelectionCore = (options: UseSelectionCoreOptions): UseSelectionCoreResult => {
  const { agents, onRefresh, onToggleNotify, onExit, notifySupported, copy, stop, kill } = options;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // 実行は非同期なので、アンマウント後の setState と二重実行を ref で防ぐ
  const mountedRef = useRef(true);
  const runningRef = useRef(false);

  const specs = useMemo<Readonly<Record<PendingActionKind, ActionSpec>>>(
    () => ({
      stop: { label: 'stop', can: canStop, reason: stopUnsupportedReason, run: stop },
      kill: { label: 'kill', can: canKill, reason: killUnsupportedReason, run: kill },
    }),
    [stop, kill],
  );

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

  const select = useCallback(
    (index: number) => {
      if (index < 0 || index >= agents.length) {
        return;
      }
      setSelectedIndex(index);
    },
    [agents.length],
  );

  const copyAt = useCallback(
    (index: number) => {
      const agent = agents[index];
      if (agent === undefined) {
        return;
      }
      const command = buildResumeCommand(agent);
      const toMessage = (copied: boolean) =>
        copied ? `コピーしました: ${command}` : `コピー非対応の環境です: ${command}`;

      const result = copy(command);
      // 同期のコピー実装ではメッセージ表示を遅延させない
      if (typeof result === 'boolean') {
        setMessage(toMessage(result));
        return;
      }
      void result.then((copied) => {
        if (mountedRef.current) {
          setMessage(toMessage(copied));
        }
      });
    },
    [agents, copy],
  );

  const copySelected = useCallback(() => {
    copyAt(selectedIndex);
  }, [copyAt, selectedIndex]);

  const toggleNotify = useCallback(() => {
    if (!notifySupported) {
      setMessage('OS 通知は macOS のみ対応しています');
      return;
    }
    // 押したときにどちらへ切り替わったかがわかるようメッセージを出す
    setMessage(onToggleNotify() ? 'OS 通知を ON にしました' : 'OS 通知を OFF にしました');
  }, [onToggleNotify, notifySupported]);

  /** 確認待ちへ入る。対象にできない相手なら理由だけ出して何もしない。 */
  const request = useCallback(
    (kind: PendingActionKind) => {
      const agent = agents[selectedIndex];
      if (agent === undefined || runningRef.current) {
        return;
      }
      const spec = specs[kind];
      if (!spec.can(agent)) {
        setMessage(`${spec.label} できません: ${spec.reason(agent)}`);
        return;
      }
      setPendingAction({ kind, sessionId: agent.sessionId });
      setMessage(`「${agent.name}」を ${spec.label} しますか? y で実行 / 他キーで取消`);
    },
    [agents, selectedIndex, specs],
  );

  /** 確認待ちの操作を実行する。対象は `run` が渡すため、ここでは待機状態を見ない。 */
  const confirm = useCallback(
    async (action: PendingAction) => {
      const spec = specs[action.kind];
      const agent = agents.find((candidate) => candidate.sessionId === action.sessionId);
      setPendingAction(null);
      if (agent === undefined) {
        // 確認中に一覧から消えた場合は何もしない
        setMessage(`${spec.label} 対象が見つかりませんでした`);
        return;
      }

      runningRef.current = true;
      setMessage(`${spec.label} 中: ${agent.name}`);

      const result = await spec.run(agent);

      runningRef.current = false;
      if (!mountedRef.current) {
        return;
      }

      if (result.ok) {
        setMessage(`${spec.label} しました: ${agent.name}`);
        // 一覧から消えるのを待たずに反映させる
        onRefresh();
        return;
      }
      setMessage(`${spec.label} に失敗しました: ${result.error.message}`);
    },
    [agents, specs, onRefresh],
  );

  const cancel = useCallback(
    (action: PendingAction) => {
      setPendingAction(null);
      setMessage(`${specs[action.kind].label} を取り消しました`);
    },
    [specs],
  );

  const run = useCallback(
    (command: SelectionCommand) => {
      // 確認待ち中は confirm 以外をすべて取消として消費し、誤操作を防ぐ
      if (pendingAction !== null) {
        if (command === 'confirm') {
          void confirm(pendingAction);
          return;
        }
        cancel(pendingAction);
        return;
      }

      switch (command) {
        case 'up':
          move(-1);
          return;
        case 'down':
          move(1);
          return;
        case 'copy':
          copySelected();
          return;
        case 'refresh':
          onRefresh();
          setMessage('更新しました');
          return;
        case 'toggleNotify':
          toggleNotify();
          return;
        case 'requestStop':
          request('stop');
          return;
        case 'requestKill':
          request('kill');
          return;
        case 'quit':
          onExit();
          return;
        default:
          // 確認待ちでないときの confirm / cancel / other は何もしない
          return;
      }
    },
    [
      pendingAction,
      confirm,
      cancel,
      move,
      copySelected,
      onRefresh,
      toggleNotify,
      request,
      onExit,
    ],
  );

  return {
    selectedIndex,
    selectedSessionId: agents[selectedIndex]?.sessionId ?? null,
    message,
    setMessage,
    pendingAction,
    run,
    select,
    copyAt,
  };
};
