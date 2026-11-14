import { describe, expect, it } from 'vitest';
import type { CharacterState, TransitionEvent } from '../types/agent.js';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  formatMinWork,
  nextWorkingSince,
  shouldNotify,
  toNotificationSettings,
  withSound,
} from './notificationSettings.js';

const event = (
  from: CharacterState | null,
  to: CharacterState,
  at = 0,
  sessionId = 'a',
): TransitionEvent => ({ sessionId, name: sessionId, from, to, at });

describe('nextWorkingSince', () => {
  it('作業中へ入ったら記録し、出たら消す', () => {
    const started = nextWorkingSince(new Map(), [event('waiting', 'working', 100)]);
    expect(started.get('a')).toBe(100);
    expect(nextWorkingSince(started, [event('working', 'waiting', 200)]).has('a')).toBe(false);
  });

  it('遷移が無ければ同じものを返す', () => {
    const current = new Map([['a', 1]]);
    expect(nextWorkingSince(current, [])).toBe(current);
  });
});

describe('shouldNotify', () => {
  const settings = DEFAULT_NOTIFICATION_SETTINGS;

  it('既定ではすべての通知対象を通知する', () => {
    expect(shouldNotify(event('working', 'waiting'), settings, new Map())).toBe(true);
    expect(shouldNotify(event('working', 'blocked'), settings, new Map())).toBe(true);
    expect(shouldNotify(event('working', 'done'), settings, new Map())).toBe(true);
  });

  it('通知対象でない遷移は通知しない', () => {
    expect(shouldNotify(event('waiting', 'working'), settings, new Map())).toBe(false);
    expect(shouldNotify(event(null, 'blocked'), settings, new Map())).toBe(false);
  });

  it.each([
    ['blocked', event('working', 'blocked')],
    ['finished', event('working', 'waiting')],
    ['done', event('working', 'done')],
  ] as const)('%s を切ればその通知は出さない', (key, transition) => {
    expect(shouldNotify(transition, { ...settings, [key]: false }, new Map())).toBe(false);
  });

  it('作業時間が最短に満たない完了は通知しない', () => {
    const minWork = { ...settings, minWorkSeconds: 60 };
    const since = new Map([['a', 0]]);
    expect(shouldNotify(event('working', 'waiting', 59_999), minWork, since)).toBe(false);
    expect(shouldNotify(event('working', 'waiting', 60_000), minWork, since)).toBe(true);
  });

  it('作業を始めた時刻が分からなければ通知する', () => {
    expect(
      shouldNotify(event('working', 'waiting', 1), { ...settings, minWorkSeconds: 600 }, new Map()),
    ).toBe(true);
  });

  it('最短の作業時間は承認待ち・バックグラウンド完了には効かない', () => {
    const minWork = { ...settings, minWorkSeconds: 600 };
    const since = new Map([['a', 0]]);
    expect(shouldNotify(event('working', 'blocked', 1), minWork, since)).toBe(true);
    expect(shouldNotify(event('working', 'done', 1), minWork, since)).toBe(true);
  });
});

describe('withSound', () => {
  const payload = { title: 't', message: 'm' };

  it('通知音を鳴らすならそのまま', () => {
    expect(withSound(payload, DEFAULT_NOTIFICATION_SETTINGS)).toBe(payload);
  });

  it('鳴らさないなら silent を付ける', () => {
    expect(withSound(payload, { ...DEFAULT_NOTIFICATION_SETTINGS, sound: false })).toEqual({
      ...payload,
      silent: true,
    });
  });
});

describe('formatMinWork', () => {
  it.each([
    [0, 'すべて'],
    [30, '30 秒以上'],
    [60, '1 分以上'],
    [600, '10 分以上'],
  ])('%i 秒は %s', (seconds, label) => {
    expect(formatMinWork(seconds)).toBe(label);
  });
});

describe('toNotificationSettings', () => {
  it('既定ではすべて通知し、音も鳴らす', () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS).toEqual({
      blocked: true,
      finished: true,
      done: true,
      minWorkSeconds: 0,
      sound: true,
    });
  });

  it('正しい値はそのまま使う', () => {
    const value = { blocked: false, finished: true, done: false, minWorkSeconds: 300, sound: false };
    expect(toNotificationSettings(value)).toEqual(value);
  });

  it('解釈できない項目だけ既定値で埋める', () => {
    expect(
      toNotificationSettings({ blocked: 'no', finished: false, minWorkSeconds: -5, sound: 1 }),
    ).toEqual({ ...DEFAULT_NOTIFICATION_SETTINGS, finished: false });
    expect(toNotificationSettings({ minWorkSeconds: 1.5 }).minWorkSeconds).toBe(0);
  });

  it('オブジェクト以外は既定値', () => {
    expect(toNotificationSettings(null)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });
});
