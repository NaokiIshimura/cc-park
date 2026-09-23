import type { NotificationPayload } from '../shared/notification.js';
import {
  dueFireAt,
  removeSchedule,
  upsertSchedule,
  type Schedule,
} from '../shared/schedule.js';
import type { LaunchAgentResult } from './launchAgent.js';

/**
 * 予約の発火ループ。
 *
 * 「次の発火まで 1 つの長い setTimeout を張る」方式は採らない。スリープや時刻変更で
 * ずれるうえ、ずれたことに気づけないため。短い間隔でティックし、
 * 前回チェックからの区間を跨いだかで判定する（一覧のポーリングと同じ考え方）。
 *
 * 予約の一覧そのものもここが持つ。発火による `lastFiredAt` の更新と
 * 画面からの追加・削除が同じ配列を通るので、書き込みが競合しない。
 */

/** ティックの間隔。分単位の予約に対して十分細かく、負荷も無視できる範囲にする。 */
export const DEFAULT_TICK_MS = 30_000;

/** 発火の結果。OS 通知と画面のメッセージの双方に使う。 */
export interface ScheduleFiredEvent {
  readonly scheduleId: string;
  /** 発火した「予定時刻」。実際に起動した時刻ではない */
  readonly firedAt: number;
  readonly ok: boolean;
  readonly message: string;
}

export interface SchedulerDeps {
  readonly load: () => Promise<Schedule[]>;
  readonly save: (schedules: readonly Schedule[]) => Promise<boolean>;
  readonly launch: (schedule: Schedule) => Promise<LaunchAgentResult>;
  /** OS 通知。未指定なら通知しない */
  readonly notify?: ((payload: NotificationPayload) => void) | undefined;
  /** 発火を画面へ知らせる。未指定なら何もしない */
  readonly onFired?: ((event: ScheduleFiredEvent) => void) | undefined;
  readonly now?: () => number;
  readonly tickMs?: number;
}

export interface Scheduler {
  /** 予約を読み込み、ティックを開始する */
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  /** 1 回ぶんの発火判定。スリープ復帰時にも呼ぶ */
  readonly tick: () => Promise<void>;
  readonly list: () => Promise<Schedule[]>;
  /** 追加・更新。更新のときは `lastFiredAt` を引き継ぐ */
  readonly save: (schedule: Schedule) => Promise<Schedule[]>;
  readonly remove: (id: string) => Promise<Schedule[]>;
  readonly setEnabled: (id: string, enabled: boolean) => Promise<Schedule[]>;
}

/** 発火結果を人が読む文言にする。 */
export const describeLaunch = (
  schedule: Schedule,
  result: LaunchAgentResult,
): { ok: boolean; message: string } =>
  result.ok
    ? { ok: true, message: `${schedule.time} の予約を ${schedule.cwd} で起動しました` }
    : { ok: false, message: `${schedule.time} の予約を起動できません: ${result.error.message}` };

/** 発火結果から OS 通知を組み立てる。 */
export const toScheduleNotification = (event: ScheduleFiredEvent): NotificationPayload => ({
  title: event.ok ? '[予約] Claude Code' : '[予約失敗] Claude Code',
  message: event.message,
});

export const createScheduler = (deps: SchedulerDeps): Scheduler => {
  const now = deps.now ?? (() => Date.now());
  const tickMs = deps.tickMs ?? DEFAULT_TICK_MS;

  let schedules: Schedule[] = [];
  let loading: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  /**
   * 発火判定の起点。
   *
   * 起動時刻で始めることで、アプリを閉じている間に過ぎた予約を
   * 起動直後にまとめて発火させない（寝ている間の予約が朝いちで何本も走らないように）。
   */
  let since = now();

  const ensureLoaded = (): Promise<void> => {
    loading ??= deps.load().then((loaded) => {
      schedules = loaded;
    });
    return loading;
  };

  const persist = async (): Promise<Schedule[]> => {
    await deps.save(schedules);
    return schedules;
  };

  const fire = async (schedule: Schedule, at: number): Promise<void> => {
    const result = await deps.launch(schedule);
    const { ok, message } = describeLaunch(schedule, result);
    const event: ScheduleFiredEvent = { scheduleId: schedule.id, firedAt: at, ok, message };

    deps.notify?.(toScheduleNotification(event));
    deps.onFired?.(event);
  };

  const tick = async (): Promise<void> => {
    // 起動に手間取っている間に次のティックが重ならないようにする
    if (running) {
      return;
    }
    running = true;

    try {
      await ensureLoaded();

      const at = now();
      const due = schedules
        .map((schedule) => ({ schedule, firedAt: dueFireAt(schedule, at, since) }))
        .filter(
          (entry): entry is { schedule: Schedule; firedAt: number } => entry.firedAt !== null,
        );
      since = at;

      if (due.length === 0) {
        return;
      }

      // 起動する前に「発火済み」を書き込む。起動の途中で落ちても、
      // 次の起動時に同じ予約をもう一度走らせないため
      for (const { schedule, firedAt } of due) {
        schedules = upsertSchedule(schedules, { ...schedule, lastFiredAt: firedAt });
      }
      await persist();

      for (const { schedule, firedAt } of due) {
        await fire(schedule, firedAt);
      }
    } finally {
      running = false;
    }
  };

  const start = async (): Promise<void> => {
    await ensureLoaded();
    if (timer !== null) {
      return;
    }
    timer = setInterval(() => {
      void tick();
    }, tickMs);
  };

  const stop = (): void => {
    if (timer === null) {
      return;
    }
    clearInterval(timer);
    timer = null;
  };

  const list = async (): Promise<Schedule[]> => {
    await ensureLoaded();
    return schedules;
  };

  const save = async (schedule: Schedule): Promise<Schedule[]> => {
    await ensureLoaded();
    const existing = schedules.find((current) => current.id === schedule.id);
    // 画面から送られてくる値で発火済みの記録を消さない
    schedules = upsertSchedule(schedules, {
      ...schedule,
      lastFiredAt: existing?.lastFiredAt ?? schedule.lastFiredAt,
    });
    return persist();
  };

  const remove = async (id: string): Promise<Schedule[]> => {
    await ensureLoaded();
    schedules = removeSchedule(schedules, id);
    return persist();
  };

  const setEnabled = async (id: string, enabled: boolean): Promise<Schedule[]> => {
    await ensureLoaded();
    const target = schedules.find((current) => current.id === id);
    if (target === undefined) {
      return schedules;
    }
    schedules = upsertSchedule(schedules, { ...target, enabled });
    return persist();
  };

  return { start, stop, tick, list, save, remove, setEnabled };
};
