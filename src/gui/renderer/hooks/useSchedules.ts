import { useCallback, useEffect, useState } from 'react';
import type { ScheduleFiredEvent } from '../../../core/scheduler.js';
import { sortSchedules, type Schedule } from '../../../shared/schedule.js';
import type { ScheduledLaunch } from '../../../shared/scheduledLaunch.js';
import type { CcParkBridge } from '../../ipc.js';

/**
 * 予約の取得と更新。
 *
 * 一覧の正は main プロセス側（`createScheduler`）が持つ。ここでは受け取った結果を
 * 並べ替えて保持するだけにして、画面と main で内容が食い違わないようにする。
 */

/** 予約まわりで使う口だけを取り出したもの。テストから最小限の偽物を渡せる。 */
export type ScheduleBridge = Pick<
  CcParkBridge,
  | 'listSchedules'
  | 'saveSchedule'
  | 'deleteSchedule'
  | 'setScheduleEnabled'
  | 'listScheduledLaunches'
  | 'onScheduleFired'
>;

export interface UseSchedulesResult {
  readonly schedules: readonly Schedule[];
  readonly save: (schedule: Schedule) => Promise<void>;
  readonly remove: (id: string) => Promise<void>;
  readonly setEnabled: (id: string, enabled: boolean) => Promise<void>;
  /** 予約から起動したセッションの記録。一覧の行に印を付けるのに使う */
  readonly launches: readonly ScheduledLaunch[];
  /** 直近の発火。フッタのメッセージに使う */
  readonly firedEvent: ScheduleFiredEvent | null;
}

export const useSchedules = (bridge: ScheduleBridge): UseSchedulesResult => {
  const [schedules, setSchedules] = useState<readonly Schedule[]>([]);
  const [launches, setLaunches] = useState<readonly ScheduledLaunch[]>([]);
  const [firedEvent, setFiredEvent] = useState<ScheduleFiredEvent | null>(null);

  const apply = useCallback((next: readonly Schedule[]) => {
    setSchedules(sortSchedules(next));
  }, []);

  useEffect(() => {
    let alive = true;

    const reload = () => {
      void bridge.listSchedules().then((loaded) => {
        if (alive) {
          apply(loaded);
        }
      });
      void bridge.listScheduledLaunches().then((loaded) => {
        if (alive) {
          setLaunches(loaded);
        }
      });
    };

    reload();

    // 発火は main のタイマーで起こる。次回発火の表示と起動の記録を更新するため取り直す
    const unsubscribe = bridge.onScheduleFired((event) => {
      setFiredEvent(event);
      reload();
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [bridge, apply]);

  const save = useCallback(
    async (schedule: Schedule) => {
      apply(await bridge.saveSchedule(schedule));
    },
    [bridge, apply],
  );

  const remove = useCallback(
    async (id: string) => {
      apply(await bridge.deleteSchedule(id));
    },
    [bridge, apply],
  );

  const setEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      apply(await bridge.setScheduleEnabled(id, enabled));
    },
    [bridge, apply],
  );

  return { schedules, save, remove, setEnabled, launches, firedEvent };
};
