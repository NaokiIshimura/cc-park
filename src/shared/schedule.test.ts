import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSchedule,
  createScheduleId,
  daysForRepeatMode,
  dueFireAt,
  formatNextFire,
  formatWeekdays,
  nextFireAt,
  normalizeCwd,
  normalizeTime,
  parseTime,
  previousFireAt,
  removeSchedule,
  repeatModeOf,
  sortSchedules,
  upsertSchedule,
  validateSchedule,
  type Schedule,
} from './schedule.js';

/** タイムゾーンに左右されないよう、ローカル時刻から組み立てる。 */
const at = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number => new Date(year, month - 1, day, hour, minute, 0, 0).getTime();

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 'a1',
  time: '09:00',
  cwd: '/Users/naoki/GitHub/cc-park',
  prompt: '今日の TODO を整理して',
  enabled: true,
  lastFiredAt: null,
  ...overrides,
});

describe('parseTime', () => {
  it('HH:MM を時と分へ分解する', () => {
    expect(parseTime('09:05')).toEqual({ hour: 9, minute: 5 });
  });

  it('1 桁の時も受け付ける', () => {
    expect(parseTime('9:05')).toEqual({ hour: 9, minute: 5 });
  });

  it('前後の空白を無視する', () => {
    expect(parseTime(' 23:59 ')).toEqual({ hour: 23, minute: 59 });
  });

  it('形式が合わなければ null', () => {
    expect(parseTime('0900')).toBeNull();
    expect(parseTime('')).toBeNull();
    expect(parseTime('09:5')).toBeNull();
  });

  it('24 時以降は null', () => {
    expect(parseTime('24:00')).toBeNull();
  });

  it('60 分以降は null', () => {
    expect(parseTime('09:60')).toBeNull();
  });
});

describe('normalizeTime', () => {
  it('0 埋めして揃える', () => {
    expect(normalizeTime('9:05')).toBe('09:05');
  });

  it('解釈できない値は詰めただけで返す', () => {
    expect(normalizeTime(' あとで ')).toBe('あとで');
  });
});

describe('normalizeCwd', () => {
  it('~ をホームへ展開する', () => {
    expect(normalizeCwd('~', '/Users/naoki')).toBe('/Users/naoki');
  });

  it('~/ 配下を展開する', () => {
    expect(normalizeCwd('~/GitHub/cc-park', '/Users/naoki')).toBe('/Users/naoki/GitHub/cc-park');
  });

  it('ホームが分からなければ ~ のままにする', () => {
    expect(normalizeCwd('~/GitHub', '')).toBe('~/GitHub');
  });

  it('末尾のスラッシュを落とす', () => {
    expect(normalizeCwd('/Users/naoki/GitHub/', '/Users/naoki')).toBe('/Users/naoki/GitHub');
  });

  it('絶対パスはそのまま返す', () => {
    expect(normalizeCwd(' /tmp ', '/Users/naoki')).toBe('/tmp');
  });
});

describe('validateSchedule', () => {
  const input = { time: '09:00', cwd: '/Users/naoki', prompt: 'おはよう' };

  it('3 項目が揃っていれば ok', () => {
    expect(validateSchedule(input)).toEqual({ ok: true });
  });

  it('時刻の形式が違えば時刻のエラーを返す', () => {
    const result = validateSchedule({ ...input, time: '99:99' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.time).toContain('HH:MM');
    }
  });

  it('ディレクトリが空ならエラーを返す', () => {
    const result = validateSchedule({ ...input, cwd: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.cwd).toContain('入力');
    }
  });

  it('相対パスはエラーにする', () => {
    const result = validateSchedule({ ...input, cwd: 'GitHub/cc-park' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.cwd).toContain('絶対パス');
    }
  });

  it('プロンプトが空ならエラーを返す', () => {
    const result = validateSchedule({ ...input, prompt: '  ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.prompt).toContain('プロンプト');
    }
  });
});

describe('createScheduleId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('毎回違う ID を発番する', () => {
    expect(createScheduleId()).not.toBe(createScheduleId());
  });

  it('crypto.randomUUID が無くても発番できる', () => {
    vi.stubGlobal('crypto', {});
    expect(createScheduleId()).toMatch(/^schedule-/);
  });
});

describe('createSchedule', () => {
  it('整形して有効な予約を組み立てる', () => {
    expect(
      createSchedule({ time: '9:00', cwd: ' /tmp ', prompt: ' 掃除して ' }, 'id-1'),
    ).toEqual({
      id: 'id-1',
      time: '09:00',
      cwd: '/tmp',
      prompt: '掃除して',
      enabled: true,
      lastFiredAt: null,
    });
  });
});

describe('nextFireAt', () => {
  it('今日の指定時刻がまだなら今日を返す', () => {
    expect(nextFireAt(schedule(), at(2026, 9, 23, 8, 0))).toBe(at(2026, 9, 23, 9, 0));
  });

  it('過ぎていれば翌日を返す', () => {
    expect(nextFireAt(schedule(), at(2026, 9, 23, 10, 0))).toBe(at(2026, 9, 24, 9, 0));
  });

  it('ちょうど指定時刻なら翌日を返す', () => {
    expect(nextFireAt(schedule(), at(2026, 9, 23, 9, 0))).toBe(at(2026, 9, 24, 9, 0));
  });

  it('月をまたぐ場合も翌日へ送る', () => {
    expect(nextFireAt(schedule(), at(2026, 9, 30, 23, 0))).toBe(at(2026, 10, 1, 9, 0));
  });

  it('時刻が壊れていれば null', () => {
    expect(nextFireAt(schedule({ time: 'あとで' }), at(2026, 9, 23, 8, 0))).toBeNull();
  });
});

describe('previousFireAt', () => {
  it('今日の指定時刻を過ぎていれば今日を返す', () => {
    expect(previousFireAt(schedule(), at(2026, 9, 23, 10, 0))).toBe(at(2026, 9, 23, 9, 0));
  });

  it('まだなら前日を返す', () => {
    expect(previousFireAt(schedule(), at(2026, 9, 23, 8, 0))).toBe(at(2026, 9, 22, 9, 0));
  });

  it('時刻が壊れていれば null', () => {
    expect(previousFireAt(schedule({ time: '' }), at(2026, 9, 23, 8, 0))).toBeNull();
  });
});

describe('dueFireAt', () => {
  const since = at(2026, 9, 23, 8, 59);
  const now = at(2026, 9, 23, 9, 0);

  it('区間を跨いだら予定時刻を返す', () => {
    expect(dueFireAt(schedule(), now, since)).toBe(at(2026, 9, 23, 9, 0));
  });

  it('ティックが遅れても取りこぼさない', () => {
    const late = at(2026, 9, 23, 9, 30);
    expect(dueFireAt(schedule(), late, since)).toBe(at(2026, 9, 23, 9, 0));
  });

  it('まだ跨いでいなければ null', () => {
    expect(dueFireAt(schedule(), at(2026, 9, 23, 8, 59), since)).toBeNull();
  });

  it('無効な予約は発火しない', () => {
    expect(dueFireAt(schedule({ enabled: false }), now, since)).toBeNull();
  });

  it('時刻が壊れていれば発火しない', () => {
    expect(dueFireAt(schedule({ time: 'あとで' }), now, since)).toBeNull();
  });

  it('同じ予定時刻では二度発火しない', () => {
    const fired = schedule({ lastFiredAt: at(2026, 9, 23, 9, 0) });
    expect(dueFireAt(fired, at(2026, 9, 23, 9, 30), since)).toBeNull();
  });

  it('前日に発火していても翌日は発火する', () => {
    const fired = schedule({ lastFiredAt: at(2026, 9, 22, 9, 0) });
    expect(dueFireAt(fired, now, since)).toBe(at(2026, 9, 23, 9, 0));
  });
});

describe('formatNextFire', () => {
  it('今日の予定は今日と表示する', () => {
    expect(formatNextFire(schedule(), at(2026, 9, 23, 8, 0))).toBe('今日 09:00');
  });

  it('過ぎた予定は明日と表示する', () => {
    expect(formatNextFire(schedule(), at(2026, 9, 23, 10, 0))).toBe('明日 09:00');
  });

  it('無効な予約は停止中と表示する', () => {
    expect(formatNextFire(schedule({ enabled: false }), at(2026, 9, 23, 8, 0))).toBe('停止中');
  });

  it('時刻が壊れていれば - を返す', () => {
    expect(formatNextFire(schedule({ time: 'あとで' }), at(2026, 9, 23, 8, 0))).toBe('-');
  });
});

describe('sortSchedules', () => {
  it('時刻の早い順に並べる', () => {
    const sorted = sortSchedules([
      schedule({ id: 'b', time: '21:00' }),
      schedule({ id: 'a', time: '07:30' }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('同時刻は ID で安定させる', () => {
    const sorted = sortSchedules([schedule({ id: 'z' }), schedule({ id: 'a' })]);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'z']);
  });

  it('元の配列を書き換えない', () => {
    const original = [schedule({ id: 'b', time: '21:00' }), schedule({ id: 'a', time: '07:30' })];
    sortSchedules(original);
    expect(original.map((item) => item.id)).toEqual(['b', 'a']);
  });
});

describe('upsertSchedule', () => {
  it('同じ ID は置き換える', () => {
    const result = upsertSchedule([schedule({ id: 'a' })], schedule({ id: 'a', time: '10:00' }));
    expect(result).toHaveLength(1);
    expect(result[0]?.time).toBe('10:00');
  });

  it('新しい ID は末尾へ足す', () => {
    const result = upsertSchedule([schedule({ id: 'a' })], schedule({ id: 'b' }));
    expect(result.map((item) => item.id)).toEqual(['a', 'b']);
  });
});

describe('removeSchedule', () => {
  it('ID で 1 件取り除く', () => {
    const result = removeSchedule([schedule({ id: 'a' }), schedule({ id: 'b' })], 'a');
    expect(result.map((item) => item.id)).toEqual(['b']);
  });
});

/*
 * 曜日の指定。2026-09-21 が月曜（21 月 / 22 火 / 23 水 / 24 木 / 25 金 / 26 土 / 27 日 / 28 月）。
 */
describe('曜日の指定', () => {
  const weekdays = schedule({ days: [1, 2, 3, 4, 5] });
  const mwf = schedule({ days: [1, 3, 5] });

  it('平日の予約は、金曜の後は土日を飛ばして月曜に起動する', () => {
    expect(nextFireAt(weekdays, at(2026, 9, 25, 10, 0))).toBe(at(2026, 9, 28, 9, 0));
    expect(nextFireAt(weekdays, at(2026, 9, 26, 8, 0))).toBe(at(2026, 9, 28, 9, 0));
  });

  it('当日が起動する曜日で、時刻がまだなら今日を返す', () => {
    expect(nextFireAt(mwf, at(2026, 9, 23, 8, 0))).toBe(at(2026, 9, 23, 9, 0));
  });

  it('1 曜日だけでも、来週の同じ曜日まで探す', () => {
    const monday = schedule({ days: [1] });
    expect(nextFireAt(monday, at(2026, 9, 21, 10, 0))).toBe(at(2026, 9, 28, 9, 0));
  });

  it('直近に過ぎた発火も、起動する曜日だけを数える', () => {
    expect(previousFireAt(weekdays, at(2026, 9, 27, 12, 0))).toBe(at(2026, 9, 25, 9, 0));
    expect(previousFireAt(mwf, at(2026, 9, 24, 12, 0))).toBe(at(2026, 9, 23, 9, 0));
  });

  it('起動しない曜日には発火しない', () => {
    const saturday = at(2026, 9, 26, 9, 0);
    expect(dueFireAt(weekdays, saturday, at(2026, 9, 26, 8, 59))).toBeNull();
    const friday = at(2026, 9, 25, 9, 0);
    expect(dueFireAt(weekdays, friday, at(2026, 9, 25, 8, 59))).toBe(friday);
  });

  it('次回が明後日以降なら曜日で示す', () => {
    expect(formatNextFire(weekdays, at(2026, 9, 25, 10, 0))).toBe('月曜 09:00');
    expect(formatNextFire(mwf, at(2026, 9, 23, 10, 0))).toBe('金曜 09:00');
    expect(formatNextFire(weekdays, at(2026, 9, 27, 10, 0))).toBe('明日 09:00');
  });

  it('曜日を表示する（毎日・平日・土日はまとめて呼ぶ）', () => {
    expect(formatWeekdays(schedule())).toBe('毎日');
    expect(formatWeekdays(schedule({ days: [0, 1, 2, 3, 4, 5, 6] }))).toBe('毎日');
    expect(formatWeekdays(weekdays)).toBe('平日');
    expect(formatWeekdays(schedule({ days: [6, 0] }))).toBe('土日');
    expect(formatWeekdays(schedule({ days: [5, 1, 3] }))).toBe('月・水・金');
    expect(formatWeekdays(schedule({ days: [0, 2] }))).toBe('火・日');
  });

  it('曜日から繰り返しの選び方を決める', () => {
    expect(repeatModeOf([0, 1, 2, 3, 4, 5, 6])).toBe('daily');
    expect(repeatModeOf([5, 4, 3, 2, 1])).toBe('weekdays');
    expect(repeatModeOf([1, 3, 5])).toBe('custom');
    expect(repeatModeOf([0, 6])).toBe('custom');
  });

  it('選び方から曜日を決める（曜日指定は選んだ曜日をそのまま使う）', () => {
    expect(daysForRepeatMode('daily', [1])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(daysForRepeatMode('weekdays', [1])).toEqual([1, 2, 3, 4, 5]);
    expect(daysForRepeatMode('custom', [1, 3])).toEqual([1, 3]);
  });

  it('曜日を 1 つも選ばなければエラーにする', () => {
    expect(validateSchedule({ time: '09:00', days: [], cwd: '/tmp', prompt: 'x' })).toEqual({
      ok: false,
      errors: { days: '曜日を 1 つ以上選んでください。' },
    });
  });

  it('予約を組み立てるとき、毎日なら曜日を持たず、それ以外は日曜始まりに揃えて持つ', () => {
    const base = { time: '09:00', cwd: '/tmp', prompt: 'x' };
    expect(createSchedule({ ...base, days: [1, 2, 3, 4, 5, 6, 0] }, 'a')).not.toHaveProperty(
      'days',
    );
    expect(createSchedule({ ...base, days: [5, 1, 3, 1] }, 'a').days).toEqual([1, 3, 5]);
  });
});
