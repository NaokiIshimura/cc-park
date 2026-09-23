import { useCallback, useEffect, useState } from 'react';
import type { ScheduleFiredEvent } from '../../../core/scheduler.js';
import { sortSchedules, type Schedule } from '../../../shared/schedule.js';
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
  'listSchedules' | 'saveSchedule' | 'deleteSchedule' | 'setScheduleEnabled' | 'onScheduleFired'
>;

export interface UseSchedulesResult {
  readonly schedules: readonly Schedule[];
  readonly save: (schedule: Schedule) => Promise<void>;
  readonly remove: (id: string) => Promise<void>;
  readonly setEnabled: (id: string, enabled: boolean) => Promise<void>;
  /** 直近の発火。フッタのメッセージに使う */
  readonly firedEvent: ScheduleFiredEvent | null;
}

export const useSchedules = (bridge: ScheduleBridge): UseSchedulesResult => {
  const [schedules, setSchedules] = useState<readonly Schedule[]>([]);
  const [firedEvent, setFiredEvent] = useState<ScheduleFiredEvent | null>(null);

  const apply = useCallback((next: readonly Schedule[]) => {
    setSchedules(sortSchedules(next));
  }, []);

  useEffect(() => {
    let alive = true;

    void bridge.listSchedules().then((loaded) => {
      if (alive) {
        apply(loaded);
      }
    });

    // 発火は main のタイマーで起こる。次回発火の表示を更新するため一覧も取り直す
    const unsubscribe = bridge.onScheduleFired((event) => {
      setFiredEvent(event);
      void bridge.listSchedules().then((loaded) => {
        if (alive) {
          apply(loaded);
        }
      });
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

  return { schedules, save, remove, setEnabled, firedEvent };
};
