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

/** 直近リクエストが占めているコンテキスト量。 */
export interface TokenUsage {
  /** input + cache_creation + cache_read の合計 */
  readonly used: number;
  /** 推定したコンテキスト上限 */
  readonly limit: number;
  /** used / limit（0〜1 にクランプ済み） */
  readonly ratio: number;
}

/**
 * 実行中のサブエージェント。
 *
 * `claude agents --json` はサブエージェントを出力しないため、transcript から導出する。
 * 現行のサブエージェントは非同期に走り、`tool_result` は起動を受理しただけの通知なので、
 * 完了は最終報告（途中経過でない `<task-notification>` か、`<agent-message>` の hand-back）の
 * 到着で判断する。
 */
export interface Subagent {
  /** 起動した `tool_use` の ID。完了判定のキーになる */
  readonly toolUseId: string;
  /** `subagent_type`（`general-purpose` など）。取れなければ空文字 */
  readonly type: string;
  /** 呼び出し時の短い説明。取れなければ空文字 */
  readonly description: string;
  /**
   * 起動時刻（epoch ms）。transcript の `timestamp` から取る。
   *
   * 取れなければ undefined。`NaN` を入れると経過時間の比較がすべて false になり、
   * かえって一切表示されなくなるため、欠落は undefined で表す。
   */
  readonly startedAt: number | undefined;
}

/**
 * transcript から補完したセッションの付加情報。
 *
 * `claude agents --json` には含まれないため、取得できないことを前提に
 * 各項目を `undefined` 許容にしている。
 */
export interface SessionMeta {
  /** 最後にユーザーが与えたプロンプト。改行は空白へ潰して 1 行にしてある */
  readonly lastPrompt: string | undefined;
  readonly tokens: TokenUsage | undefined;
  /** まだ結果が返っていないサブエージェント。いなければ空配列 */
  readonly subagents: readonly Subagent[];
}

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
  /** transcript 由来の付加情報。読み取らない / 読めない場合は undefined */
  readonly meta: SessionMeta | undefined;
}

/** 状態遷移イベント。新規出現時は `from` が null になる。 */
export interface TransitionEvent {
  readonly sessionId: string;
  readonly name: string;
  readonly from: CharacterState | null;
  readonly to: CharacterState;
  readonly at: number;
}
