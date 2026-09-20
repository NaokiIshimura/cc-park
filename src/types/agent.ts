/**
 * `claude agents --json` が出力する生のセッション情報。
 *
 * 出力仕様は非公開であり将来変更されうるため、状態を表す `status` / `state` は
 * ユニオン型ではなく `string` で受け、正規化は normalizeAgent に集約する。
 */
export interface RawAgent {
  readonly kind?: string;
  readonly sessionId?: string;
  readonly name?: string;
  readonly cwd?: string;
  readonly startedAt?: number;
  /** interactive セッションのみ */
  readonly pid?: number;
  /** background セッションのみ（短縮ID） */
  readonly id?: string;
  /** interactive セッションのみ: "busy" | "idle" */
  readonly status?: string;
  /** background セッションのみ: "blocked" | "done" | "stopped" など */
  readonly state?: string;
}

/** セッション種別 */
export type AgentKind = 'interactive' | 'background' | 'unknown';

/**
 * キャラクター表現用に正規化した状態。
 *
 * `justFinished` だけは生データに存在せず、`working` → `waiting` の遷移から
 * 一定時間だけ導出される擬似ステート。
 */
export type CharacterState =
  | 'working'
  | 'justFinished'
  | 'waiting'
  | 'blocked'
  | 'done'
  | 'stopped'
  | 'unknown';

/** 正規化後のセッション情報 */
export interface Agent {
  readonly sessionId: string;
  readonly name: string;
  readonly cwd: string;
  readonly kind: AgentKind;
  readonly startedAt: number;
  readonly state: CharacterState;
  /** 正規化前の生の状態文字列（未知の状態をそのまま画面へ出すために保持） */
  readonly rawState: string;
  readonly pid: number | undefined;
  readonly id: string | undefined;
}

/** 状態遷移イベント。新規出現時は `from` が null になる。 */
export interface TransitionEvent {
  readonly sessionId: string;
  readonly name: string;
  readonly from: CharacterState | null;
  readonly to: CharacterState;
  readonly at: number;
}
