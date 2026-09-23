import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Schedule } from '../shared/schedule.js';
import type { LaunchAgentResult } from './launchAgent.js';
import {
  createScheduler,
  describeLaunch,
  toScheduleNotification,
  type ScheduleFiredEvent,
} from './scheduler.js';

/** タイムゾーンに左右されないよう、ローカル時刻から組み立てる。 */
const at = (day: number, hour: number, minute: number): number =>
  new Date(2026, 8, day, hour, minute, 0, 0).getTime();

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 'a1',
  time: '09:00',
  cwd: '/Users/naoki/GitHub/cc-park',
  prompt: '今日の TODO を整理して',
  enabled: true,
  lastFiredAt: null,
  ...overrides,
});

const succeeded: LaunchAgentResult = { ok: true, id: '2160cf1c' };
const failed: LaunchAgentResult = {
  ok: false,
  error: { kind: 'not-found', message: 'claude コマンドが見つかりません。' },
};

/** 時計を手で進められるスケジューラ一式。 */
const harness = (initial: readonly Schedule[], startAt = at(23, 8, 59)) => {
  let clock = startAt;
  const saved: Schedule[][] = [];

  const load = vi.fn(async () => initial.map((item) => ({ ...item })));
  const save = vi.fn(async (schedules: readonly Schedule[]) => {
    saved.push(schedules.map((item) => ({ ...item })));
    return true;
  });
  const launch = vi.fn(async (_schedule: Schedule): Promise<LaunchAgentResult> => succeeded);
  const notify = vi.fn();
  const onFired = vi.fn();

  const scheduler = createScheduler({
    load,
    save,
    launch,
    notify,
    onFired,
    now: () => clock,
    tickMs: 1000,
  });

  return {
    scheduler,
    load,
    save,
    launch,
    notify,
    onFired,
    saved,
    setNow: (value: number) => {
      clock = value;
    },
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('describeLaunch', () => {
  it('成功は時刻とディレクトリを添える', () => {
    expect(describeLaunch(schedule(), succeeded)).toEqual({
      ok: true,
      message: '09:00 の予約を /Users/naoki/GitHub/cc-park で起動しました',
    });
  });

  it('失敗は理由を添える', () => {
    const described = describeLaunch(schedule(), failed);
    expect(described.ok).toBe(false);
    expect(described.message).toContain('claude コマンドが見つかりません。');
  });
});

describe('toScheduleNotification', () => {
  const event = (ok: boolean): ScheduleFiredEvent => ({
    scheduleId: 'a1',
    firedAt: at(23, 9, 0),
    ok,
    message: 'メッセージ',
  });

  it('成功は予約の通知にする', () => {
    expect(toScheduleNotification(event(true))).toEqual({
      title: '[予約] Claude Code',
      message: 'メッセージ',
    });
  });

  it('失敗は予約失敗の通知にする', () => {
    expect(toScheduleNotification(event(false)).title).toBe('[予約失敗] Claude Code');
  });
});

describe('tick', () => {
  it('予定時刻を跨いだら起動する', async () => {
    const { scheduler, launch, setNow } = harness([schedule()]);
    setNow(at(23, 9, 0));
    await scheduler.tick();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch.mock.calls[0]?.[0]).toMatchObject({ id: 'a1' });
  });

  it('起動する前に発火済みを保存する', async () => {
    const { scheduler, saved, setNow } = harness([schedule()]);
    setNow(at(23, 9, 0));
    await scheduler.tick();
    expect(saved[0]?.[0]?.lastFiredAt).toBe(at(23, 9, 0));
  });

  it('同じ予定時刻では二度起動しない', async () => {
    const { scheduler, launch, setNow } = harness([schedule()]);
    setNow(at(23, 9, 0));
    await scheduler.tick();
    setNow(at(23, 9, 30));
    await scheduler.tick();
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('翌日の同じ時刻には改めて起動する', async () => {
    const { scheduler, launch, setNow } = harness([schedule()]);
    setNow(at(23, 9, 0));
    await scheduler.tick();
    setNow(at(24, 9, 0));
    await scheduler.tick();
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('起動時より前に過ぎた予約は発火させない', async () => {
    // 8:59 に起動したので、当日 0:30 の予約は対象外
    const { scheduler, launch, setNow } = harness([schedule({ time: '00:30' })]);
    setNow(at(23, 9, 0));
    await scheduler.tick();
    expect(launch).not.toHaveBeenCalled();
  });

  it('発火が無ければ保存しない', async () => {
    const { scheduler, save, setNow } = harness([schedule()]);
    setNow(at(23, 8, 59));
    await scheduler.tick();
    expect(save).not.toHaveBeenCalled();
  });

  it('無効な予約は起動しない', async () => {
    const { scheduler, launch, setNow } = harness([schedule({ enabled: false })]);
    setNow(at(23, 9, 0));
    await scheduler.tick();
    expect(launch).not.toHaveBeenCalled();
  });

  it('複数の予約が同時に来ても順に起動する', async () => {
    const { scheduler, launch, setNow } = harness([
      schedule({ id: 'a', time: '09:00' }),
      schedule({ id: 'b', time: '09:00' }),
    ]);
    setNow(at(23, 9, 0));
    await scheduler.tick();
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('成功を通知し、画面へも知らせる', async () => {
    const { scheduler, notify, onFired, setNow } = harness([schedule()]);
    setNow(at(23, 9, 0));
    await scheduler.tick();
    expect(notify).toHaveBeenCalledWith({
      title: '[予約] Claude Code',
      message: '09:00 の予約を /Users/naoki/GitHub/cc-park で起動しました',
    });
    expect(onFired).toHaveBeenCalledWith({
      scheduleId: 'a1',
      firedAt: at(23, 9, 0),
      ok: true,
      message: '09:00 の予約を /Users/naoki/GitHub/cc-park で起動しました',
    });
  });

  it('起動に失敗しても通知して次のティックを止めない', async () => {
    const { scheduler, launch, notify, setNow } = harness([schedule()]);
    launch.mockResolvedValueOnce(failed);
    setNow(at(23, 9, 0));
    await scheduler.tick();
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ title: '[予約失敗] Claude Code' });

    setNow(at(24, 9, 0));
    await scheduler.tick();
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('通知・画面への通達・時計が未指定でも落ちない', async () => {
    // 既定の時計（Date.now）を使う。起動直後なので発火はしない
    const launch = vi.fn(async (_schedule: Schedule) => succeeded);
    const scheduler = createScheduler({
      load: async () => [schedule()],
      save: async () => true,
      launch,
    });
    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(launch).not.toHaveBeenCalled();
  });

  it('起動中に重ねて呼ばれても二重に走らせない', async () => {
    const { scheduler, launch, setNow } = harness([schedule()]);
    // 起動が終わらない状態を作り、その間に次のティックを重ねる
    let release: (value: LaunchAgentResult) => void = () => undefined;
    const pending = new Promise<LaunchAgentResult>((resolve) => {
      release = resolve;
    });
    launch.mockReturnValueOnce(pending);

    setNow(at(23, 9, 0));
    const first = scheduler.tick();
    const second = scheduler.tick();
    // 2 回目は起動を待たずに戻る
    await second;

    release(succeeded);
    await first;

    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('予約の読み込みは 1 度だけ行う', async () => {
    const { scheduler, load, setNow } = harness([schedule()]);
    setNow(at(23, 9, 0));
    await scheduler.tick();
    await scheduler.list();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('start / stop', () => {
  it('間隔ごとにティックする', async () => {
    vi.useFakeTimers();
    const { scheduler, launch, setNow } = harness([schedule()]);
    await scheduler.start();

    setNow(at(23, 9, 0));
    await vi.advanceTimersByTimeAsync(1000);
    expect(launch).toHaveBeenCalledTimes(1);

    scheduler.stop();
    setNow(at(24, 9, 0));
    await vi.advanceTimersByTimeAsync(5000);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('二重に start してもタイマーは 1 本だけ', async () => {
    vi.useFakeTimers();
    const { scheduler, launch, setNow } = harness([schedule()]);
    await scheduler.start();
    await scheduler.start();

    setNow(at(23, 9, 0));
    await vi.advanceTimersByTimeAsync(1000);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('start していなくても stop で落ちない', () => {
    const { scheduler } = harness([]);
    expect(() => {
      scheduler.stop();
    }).not.toThrow();
  });
});

describe('list / save / remove / setEnabled', () => {
  it('読み込んだ予約を返す', async () => {
    const { scheduler } = harness([schedule()]);
    expect(await scheduler.list()).toEqual([schedule()]);
  });

  it('追加して保存する', async () => {
    const { scheduler, save } = harness([]);
    const added = await scheduler.save(schedule({ id: 'b' }));
    expect(added.map((item) => item.id)).toEqual(['b']);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('更新しても発火済みの記録を引き継ぐ', async () => {
    const { scheduler, setNow } = harness([schedule()]);
    setNow(at(23, 9, 0));
    await scheduler.tick();

    const updated = await scheduler.save(schedule({ time: '10:00' }));
    expect(updated[0]).toMatchObject({ time: '10:00', lastFiredAt: at(23, 9, 0) });
  });

  it('削除して保存する', async () => {
    const { scheduler, save } = harness([schedule()]);
    expect(await scheduler.remove('a1')).toEqual([]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('有効・無効を切り替える', async () => {
    const { scheduler } = harness([schedule()]);
    expect((await scheduler.setEnabled('a1', false))[0]?.enabled).toBe(false);
    expect((await scheduler.setEnabled('a1', true))[0]?.enabled).toBe(true);
  });

  it('知らない ID の切り替えは何もしない', async () => {
    const { scheduler, save } = harness([schedule()]);
    expect(await scheduler.setEnabled('none', false)).toEqual([schedule()]);
    expect(save).not.toHaveBeenCalled();
  });
});
