import { describe, expect, it } from 'vitest';
import type { CharacterState } from '../types/agent.js';
import { isQuiet } from './pollSchedule.js';

const of = (...states: CharacterState[]) => states.map((state) => ({ state }));

describe('isQuiet', () => {
  it('入力待ち・完了・停止だけなら静か', () => {
    expect(isQuiet(of('waiting', 'done', 'stopped'))).toBe(true);
  });

  it('セッションが無いときも静か', () => {
    expect(isQuiet([])).toBe(true);
  });

  it.each(['working', 'blocked', 'justFinished', 'unknown'] as const)(
    '%s のセッションがあれば静かでない',
    (state) => {
      expect(isQuiet(of('waiting', state))).toBe(false);
    },
  );
});
