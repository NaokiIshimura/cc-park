// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleFiredEvent } from '../../../core/scheduler.js';
import type { Schedule } from '../../../shared/schedule.js';
import type { ScheduledLaunch } from '../../../shared/scheduledLaunch.js';
import { useSchedules, type ScheduleBridge } from './useSchedules.js';

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 'a1',
  time: '09:00',
  cwd: '/Users/naoki',
  prompt: 'おはよう',
  enabled: true,
  lastFiredAt: null,
  ...overrides,
});

const launch: ScheduledLaunch = {
  agentId: 'bf96c05e',
  scheduleId: 'a1',
  time: '09:00',
  firedAt: 1789881096899,
};

const fired: ScheduleFiredEvent = {
  scheduleId: 'a1',
  firedAt: 1789881096899,
  ok: true,
  message: '09:00 の予約を /Users/naoki で起動しました',
};

const createBridge = (overrides: Partial<ScheduleBridge> = {}) => {
  let listener: ((event: ScheduleFiredEvent) => void) | null = null;
  const unsubscribe = vi.fn();

  const bridge: ScheduleBridge = {
    listSchedules: vi.fn(async () => [schedule()]),
    saveSchedule: vi.fn(async () => [schedule()]),
    deleteSchedule: vi.fn(async () => []),
    setScheduleEnabled: vi.fn(async () => [schedule({ enabled: false })]),
    listScheduledLaunches: vi.fn(async () => []),
    onScheduleFired: vi.fn((next: (event: ScheduleFiredEvent) => void) => {
      listener = next;
      return unsubscribe;
    }),
    ...overrides,
  };

  return {
    bridge,
    unsubscribe,
    fire: (event: ScheduleFiredEvent) => {
      act(() => {
        listener?.(event);
      });
    },
  };
};

afterEach(cleanup);

describe('useSchedules', () => {
  it('起動時に一覧を取得する', async () => {
    const { bridge } = createBridge();
    const { result } = renderHook(() => useSchedules(bridge));
    await waitFor(() => {
      expect(result.current.schedules).toEqual([schedule()]);
    });
  });

  it('時刻の早い順に並べる', async () => {
    const { bridge } = createBridge({
      listSchedules: vi.fn(async () => [
        schedule({ id: 'b', time: '21:00' }),
        schedule({ id: 'a', time: '07:30' }),
      ]),
    });
    const { result } = renderHook(() => useSchedules(bridge));
    await waitFor(() => {
      expect(result.current.schedules.map((item) => item.id)).toEqual(['a', 'b']);
    });
  });

  it('保存すると更新後の一覧を反映する', async () => {
    const { bridge } = createBridge({ listSchedules: vi.fn(async () => []) });
    const { result } = renderHook(() => useSchedules(bridge));
    await waitFor(() => {
      expect(result.current.schedules).toEqual([]);
    });

    await act(async () => {
      await result.current.save(schedule());
    });
    expect(bridge.saveSchedule).toHaveBeenCalledWith(schedule());
    expect(result.current.schedules).toEqual([schedule()]);
  });

  it('削除すると更新後の一覧を反映する', async () => {
    const { bridge } = createBridge();
    const { result } = renderHook(() => useSchedules(bridge));
    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });

    await act(async () => {
      await result.current.remove('a1');
    });
    expect(bridge.deleteSchedule).toHaveBeenCalledWith('a1');
    expect(result.current.schedules).toEqual([]);
  });

  it('有効・無効の切り替えを反映する', async () => {
    const { bridge } = createBridge();
    const { result } = renderHook(() => useSchedules(bridge));
    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });

    await act(async () => {
      await result.current.setEnabled('a1', false);
    });
    expect(bridge.setScheduleEnabled).toHaveBeenCalledWith('a1', false);
    expect(result.current.schedules[0]?.enabled).toBe(false);
  });

  it('発火を受け取り、一覧も取り直す', async () => {
    const { bridge, fire } = createBridge();
    const { result } = renderHook(() => useSchedules(bridge));
    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });

    fire(fired);
    expect(result.current.firedEvent).toEqual(fired);
    await waitFor(() => {
      expect(bridge.listSchedules).toHaveBeenCalledTimes(2);
    });
  });

  it('後片付けで購読を解除する', async () => {
    const { bridge, unsubscribe } = createBridge();
    const { unmount, result } = renderHook(() => useSchedules(bridge));
    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('後片付けの後に取得が解決しても更新しない', async () => {
    let resolve: (schedules: Schedule[]) => void = () => undefined;
    const { bridge } = createBridge({
      listSchedules: vi.fn(
        () =>
          new Promise<Schedule[]>((next) => {
            resolve = next;
          }),
      ),
    });

    const { unmount, result } = renderHook(() => useSchedules(bridge));
    unmount();
    await act(async () => {
      resolve([schedule()]);
    });
    expect(result.current.schedules).toEqual([]);
  });

  it('発火後の取得が後片付けに間に合わなくても落ちない', async () => {
    let resolve: (schedules: Schedule[]) => void = () => undefined;
    let calls = 0;
    const { bridge, fire } = createBridge({
      listSchedules: vi.fn(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve([schedule()]);
        }
        return new Promise<Schedule[]>((next) => {
          resolve = next;
        });
      }),
    });

    const { unmount, result } = renderHook(() => useSchedules(bridge));
    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });

    fire(fired);
    unmount();
    await act(async () => {
      resolve([]);
    });
    expect(result.current.schedules).toHaveLength(1);
  });

  it('起動時に起動の記録を取得する', async () => {
    const { bridge } = createBridge({ listScheduledLaunches: vi.fn(async () => [launch]) });
    const { result } = renderHook(() => useSchedules(bridge));
    await waitFor(() => {
      expect(result.current.launches).toEqual([launch]);
    });
  });

  it('発火を受け取ると起動の記録も取り直す', async () => {
    const listScheduledLaunches = vi
      .fn<() => Promise<ScheduledLaunch[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([launch]);
    const { bridge, fire } = createBridge({ listScheduledLaunches });
    const { result } = renderHook(() => useSchedules(bridge));
    await waitFor(() => {
      expect(listScheduledLaunches).toHaveBeenCalledTimes(1);
    });

    fire(fired);
    await waitFor(() => {
      expect(result.current.launches).toEqual([launch]);
    });
  });

  it('後片付けの後に起動の記録が届いても更新しない', async () => {
    let resolve: (launches: ScheduledLaunch[]) => void = () => undefined;
    const { bridge } = createBridge({
      listScheduledLaunches: vi.fn(
        () =>
          new Promise<ScheduledLaunch[]>((next) => {
            resolve = next;
          }),
      ),
    });

    const { unmount, result } = renderHook(() => useSchedules(bridge));
    unmount();
    await act(async () => {
      resolve([launch]);
    });
    expect(result.current.launches).toEqual([]);
  });
});
