import { describe, expect, it } from 'vitest';
import {
  appendScheduledLaunch,
  describeScheduledLaunch,
  findScheduledLaunch,
  MAX_SCHEDULED_LAUNCHES,
  type ScheduledLaunch,
} from './scheduledLaunch.js';

const launch = (overrides: Partial<ScheduledLaunch> = {}): ScheduledLaunch => ({
  agentId: 'bf96c05e',
  scheduleId: 'a1',
  time: '09:00',
  firedAt: 1_000,
  ...overrides,
});

describe('appendScheduledLaunch', () => {
  it('末尾へ足す', () => {
    const first = launch({ agentId: 'aaaaaaaa' });
    const second = launch({ agentId: 'bbbbbbbb' });
    expect(appendScheduledLaunch([first], second)).toEqual([first, second]);
  });

  it('上限を超えたら古いものから捨てる', () => {
    const existing = Array.from({ length: MAX_SCHEDULED_LAUNCHES }, (_, index) =>
      launch({ firedAt: index }),
    );
    const appended = appendScheduledLaunch(existing, launch({ firedAt: 999 }));

    expect(appended).toHaveLength(MAX_SCHEDULED_LAUNCHES);
    expect(appended[0]?.firedAt).toBe(1);
    expect(appended.at(-1)?.firedAt).toBe(999);
  });
});

describe('findScheduledLaunch', () => {
  const launches = [launch()];

  it('短縮 ID が一致すれば記録を返す', () => {
    expect(findScheduledLaunch({ id: 'bf96c05e', sessionId: 'other' }, launches)).toEqual(launch());
  });

  it('id が無くても sessionId の先頭が一致すれば記録を返す', () => {
    expect(
      findScheduledLaunch(
        { id: undefined, sessionId: 'bf96c05e-48ae-459d-ac0d-48761e3e2fe2' },
        launches,
      ),
    ).toEqual(launch());
  });

  it('一致しなければ undefined', () => {
    expect(
      findScheduledLaunch({ id: '9c5592ac', sessionId: '9c5592ac-f465' }, launches),
    ).toBeUndefined();
  });

  it('ID が空の記録はどのセッションにも当てない', () => {
    expect(
      findScheduledLaunch({ id: undefined, sessionId: 'bf96c05e' }, [launch({ agentId: '' })]),
    ).toBeUndefined();
  });
});

describe('describeScheduledLaunch', () => {
  it('予約の時刻を添える', () => {
    expect(describeScheduledLaunch(launch())).toBe('09:00 の予約で起動');
  });
});
