import { describe, expect, it } from 'vitest';
import type { CharacterState, TransitionEvent } from '../types/agent.js';
import { toNotification } from './useNotifications.js';

const event = (
  from: CharacterState | null,
  to: CharacterState,
  name = 'session-a',
): TransitionEvent => ({ sessionId: 'a', name, from, to, at: 0 });

describe('toNotification', () => {
  it('working -> waiting は作業完了通知になる', () => {
    expect(toNotification(event('working', 'waiting'))).toEqual({
      title: '[完了] Claude Code',
      message: 'session-a が入力待ちになりました',
    });
  });

  it('blocked への遷移は承認待ち通知になる', () => {
    expect(toNotification(event('working', 'blocked'))?.message).toBe(
      'session-a が承認を待っています',
    );
  });

  it('done への遷移は完了通知になる', () => {
    expect(toNotification(event('working', 'done'))?.message).toBe(
      'バックグラウンド session-a が完了しました',
    );
  });

  it('新規出現（from が null）は通知しない', () => {
    expect(toNotification(event(null, 'blocked'))).toBeNull();
    expect(toNotification(event(null, 'waiting'))).toBeNull();
  });

  it('waiting -> working は通知しない', () => {
    expect(toNotification(event('waiting', 'working'))).toBeNull();
  });

  it('justFinished からの遷移では作業完了通知を出さない', () => {
    expect(toNotification(event('justFinished', 'waiting'))).toBeNull();
  });

  it('stopped への遷移は通知しない', () => {
    expect(toNotification(event('working', 'stopped'))).toBeNull();
  });

  it('unknown への遷移は通知しない', () => {
    expect(toNotification(event('working', 'unknown'))).toBeNull();
  });
});
