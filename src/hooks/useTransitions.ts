import { useEffect, useMemo, useState } from 'react';
import { diffAgents } from '../core/diffAgents.js';
import type { Agent, TransitionEvent } from '../types/agent.js';

export const DEFAULT_HIGHLIGHT_MS = 10_000;

/** 遷移が無いときに同じ参照を返し、購読側の無駄な再実行を避ける。 */
const NO_TRANSITIONS: readonly TransitionEvent[] = [];

/**
 * 「作業完了直後」のセッションの state を justFinished へ差し替える。
 * 期限切れ・状態変化したセッションは対象から外す。
 */
export const applyJustFinished = (
  agents: readonly Agent[],
  finishedUntil: ReadonlyMap<string, number>,
  now: number,
): Agent[] =>
  agents.map((agent) => {
    const until = finishedUntil.get(agent.sessionId);
    if (until === undefined || now >= until || agent.state !== 'waiting') {
      return agent;
    }
    return { ...agent, state: 'justFinished' };
  });

/**
 * 遷移イベントと生存セッションから、justFinished の期限表を更新する。
 * 内容が変わらない場合は元の Map をそのまま返す。
 */
export const nextFinishedUntil = (
  current: ReadonlyMap<string, number>,
  events: readonly TransitionEvent[],
  agents: readonly Agent[],
  highlightMs: number,
  at: number,
): ReadonlyMap<string, number> => {
  const next = new Map(current);

  for (const event of events) {
    if (event.from === 'working' && event.to === 'waiting') {
      next.set(event.sessionId, at + highlightMs);
    } else if (event.to !== 'waiting') {
      // 再び作業を始めた等、待機でなくなったらハイライトを解除する
      next.delete(event.sessionId);
    }
  }

  // 消滅したセッションの記録を残さない
  const alive = new Set(agents.map((agent) => agent.sessionId));
  for (const sessionId of [...next.keys()]) {
    if (!alive.has(sessionId)) {
      next.delete(sessionId);
    }
  }

  const unchanged =
    next.size === current.size &&
    [...next].every(([sessionId, until]) => current.get(sessionId) === until);

  return unchanged ? current : next;
};

export interface UseTransitionsResult {
  /** justFinished を適用した表示用のセッション一覧 */
  readonly agents: readonly Agent[];
  /** 直近のポーリングで検出した遷移 */
  readonly transitions: readonly TransitionEvent[];
}

/**
 * スナップショットの差分から遷移を検出し、
 * `working → waiting` のセッションを一定時間 justFinished として扱う。
 */
export const useTransitions = (
  agents: readonly Agent[],
  previousAgents: readonly Agent[] | null,
  options: { readonly highlightMs?: number; readonly now: number },
): UseTransitionsResult => {
  const highlightMs = options.highlightMs ?? DEFAULT_HIGHLIGHT_MS;
  const [transitions, setTransitions] = useState<readonly TransitionEvent[]>(NO_TRANSITIONS);
  // 期限表は描画に影響するため ref ではなく state で持つ
  const [finishedUntil, setFinishedUntil] = useState<ReadonlyMap<string, number>>(new Map());

  // previousAgents は agents と同時に更新されるため、依存は agents 側だけで足りる
  useEffect(() => {
    const at = Date.now();
    const events = diffAgents(previousAgents, agents, at);

    setTransitions(events.length === 0 ? NO_TRANSITIONS : events);
    setFinishedUntil((current) => nextFinishedUntil(current, events, agents, highlightMs, at));
  }, [agents, highlightMs]);

  const decorated = useMemo(
    () => applyJustFinished(agents, finishedUntil, options.now),
    [agents, finishedUntil, options.now],
  );

  return { agents: decorated, transitions };
};
