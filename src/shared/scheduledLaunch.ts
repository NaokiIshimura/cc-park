import type { Agent } from '../types/agent.js';

/**
 * 予約で起動したセッションの記録と、一覧のセッションとの突き合わせ。
 *
 * `claude agents --json` には起動の経緯が載らないため、予約の発火時に
 * `claude --bg` が返した短縮 ID を記録しておき、一覧の `id` と照らして見分ける。
 * ファイル入出力は core 側に持たせ、ここには計算だけを置く（renderer からも呼ぶ）。
 */

/** 予約から起動したセッション 1 件ぶんの記録。 */
export interface ScheduledLaunch {
  /** `claude --bg` が返した短縮 ID。一覧の `Agent.id` と一致する */
  readonly agentId: string;
  readonly scheduleId: string;
  /** 発火した予約の時刻（`HH:MM`）。予約を消した後でも表示できるよう複写しておく */
  readonly time: string;
  /** 発火した「予定時刻」 */
  readonly firedAt: number;
}

/**
 * 保持する記録の上限。
 *
 * 毎日くり返す予約が積もり続けないよう、古いものから捨てる。
 * 終了したセッションは一覧から消えるので、直近の分だけあれば足りる。
 */
export const MAX_SCHEDULED_LAUNCHES = 100;

/** 記録を末尾へ足し、上限を超えた古いものを捨てる。 */
export const appendScheduledLaunch = (
  launches: readonly ScheduledLaunch[],
  launch: ScheduledLaunch,
): ScheduledLaunch[] => [...launches, launch].slice(-MAX_SCHEDULED_LAUNCHES);

/**
 * セッションが予約から起動したものなら、その記録を返す。
 *
 * `id` は background セッションにしか無いため、`sessionId` の先頭とも照らす
 * （短縮 ID は `sessionId` の先頭 8 桁）。
 */
export const findScheduledLaunch = (
  agent: Pick<Agent, 'id' | 'sessionId'>,
  launches: readonly ScheduledLaunch[],
): ScheduledLaunch | undefined =>
  launches.find(
    (launch) =>
      launch.agentId !== '' &&
      (agent.id === launch.agentId || agent.sessionId.startsWith(launch.agentId)),
  );

/** 行のツールチップに出す文言。 */
export const describeScheduledLaunch = (launch: ScheduledLaunch): string =>
  `${launch.time} の予約で起動`;
