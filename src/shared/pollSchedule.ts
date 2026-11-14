import type { CharacterState } from '../types/agent.js';

/**
 * ポーリングを間引くかの判断。
 *
 * `claude agents --json` の実行（Node 製 CLI の起動）は軽くないため、
 * 見張る必要の薄いときは取得の回数を減らす。
 */

/**
 * 静かな状態。次の変化は利用者が端末で何かをしたときにしか起きないので、
 * 気づくのが数秒遅れても困らない。
 *
 * 作業中（`working`）は完了・承認待ちへの遷移をすぐ知らせたいので含めない。
 * 承認待ち（`blocked`）は承認した直後に作業中へ戻ったことを見せたいので含めない。
 * 未知の状態（`unknown`）は何が起きているか分からないので含めない。
 */
const QUIET_STATES: ReadonlySet<CharacterState> = new Set(['waiting', 'done', 'stopped']);

/** 静かなときは、ポーリング何回に 1 回だけ取得するか。既定の 2 秒間隔なら 6 秒ごとになる。 */
export const QUIET_POLL_FACTOR = 3;

/** すべてのセッションが静かか。セッションが無いときも静かとみなす。 */
export const isQuiet = (agents: readonly { readonly state: CharacterState }[]): boolean =>
  agents.every((agent) => QUIET_STATES.has(agent.state));
