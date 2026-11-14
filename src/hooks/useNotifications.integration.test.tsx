import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from '../shared/notificationSettings.js';
import type { CharacterState, TransitionEvent } from '../types/agent.js';
import { useNotifications } from './useNotifications.js';

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

const event = (
  to: CharacterState,
  at: number,
  from: CharacterState | null = 'working',
  sessionId = 'a',
): TransitionEvent => ({ sessionId, name: sessionId, from, to, at });

interface HarnessProps {
  readonly transitions: readonly TransitionEvent[];
  readonly enabled: boolean;
  readonly notifier: ReturnType<typeof vi.fn>;
  readonly settings?: NotificationSettings;
}

const Harness = ({ transitions, enabled, notifier, settings }: HarnessProps) => {
  useNotifications(transitions, {
    enabled,
    notifier: notifier as never,
    ...(settings === undefined ? {} : { settings }),
  });
  return <Text>ok</Text>;
};

describe('useNotifications', () => {
  it('通知対象の遷移で通知を出す', async () => {
    const notifier = vi.fn();
    const { unmount } = render(
      <Harness transitions={[event('waiting', 0)]} enabled notifier={notifier} />,
    );
    await wait();
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier.mock.calls[0]?.[0]).toMatchObject({ message: 'a が入力待ちになりました' });
    unmount();
  });

  it('enabled が false なら通知しない', async () => {
    const notifier = vi.fn();
    const { unmount } = render(
      <Harness transitions={[event('waiting', 0)]} enabled={false} notifier={notifier} />,
    );
    await wait();
    expect(notifier).not.toHaveBeenCalled();
    unmount();
  });

  it('通知対象外の遷移では通知しない', async () => {
    const notifier = vi.fn();
    const { unmount } = render(
      <Harness transitions={[event('working', 0, 'waiting')]} enabled notifier={notifier} />,
    );
    await wait();
    expect(notifier).not.toHaveBeenCalled();
    unmount();
  });

  it('同一セッション・同一遷移の連続通知を抑制する', async () => {
    const notifier = vi.fn();
    const { rerender, unmount } = render(
      <Harness transitions={[event('waiting', 1000)]} enabled notifier={notifier} />,
    );
    await wait();

    rerender(<Harness transitions={[event('waiting', 1500)]} enabled notifier={notifier} />);
    await wait();

    expect(notifier).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('抑制時間を過ぎたら再通知する', async () => {
    const notifier = vi.fn();
    const { rerender, unmount } = render(
      <Harness transitions={[event('waiting', 1000)]} enabled notifier={notifier} />,
    );
    await wait();

    rerender(<Harness transitions={[event('waiting', 5000)]} enabled notifier={notifier} />);
    await wait();

    expect(notifier).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('別セッションの同じ遷移は抑制しない', async () => {
    const notifier = vi.fn();
    const { unmount } = render(
      <Harness
        transitions={[event('waiting', 1000), event('waiting', 1000, 'working', 'b')]}
        enabled
        notifier={notifier}
      />,
    );
    await wait();
    expect(notifier).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('blocked と done も通知する', async () => {
    const notifier = vi.fn();
    const { unmount } = render(
      <Harness
        transitions={[event('blocked', 0), event('done', 0, 'working', 'b')]}
        enabled
        notifier={notifier}
      />,
    );
    await wait();
    expect(notifier).toHaveBeenCalledTimes(2);
    unmount();
  });

  describe('通知の条件', () => {
    const settings = (overrides: Partial<NotificationSettings>): NotificationSettings => ({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...overrides,
    });

    it('種類ごとに切った通知は出さない', async () => {
      const notifier = vi.fn();
      const { unmount } = render(
        <Harness
          transitions={[event('blocked', 0), event('waiting', 0, 'working', 'b')]}
          enabled
          notifier={notifier}
          settings={settings({ blocked: false })}
        />,
      );
      await wait();
      expect(notifier).toHaveBeenCalledTimes(1);
      expect(notifier.mock.calls[0]?.[0]).toMatchObject({ message: 'b が入力待ちになりました' });
      unmount();
    });

    it('作業時間が短い完了は通知せず、長い完了は通知する', async () => {
      const notifier = vi.fn();
      const minWork = settings({ minWorkSeconds: 60 });
      const { rerender, unmount } = render(
        <Harness
          transitions={[event('working', 0, 'waiting'), event('working', 0, 'waiting', 'b')]}
          enabled
          notifier={notifier}
          settings={minWork}
        />,
      );
      await wait();
      rerender(
        <Harness
          transitions={[event('waiting', 30_000), event('waiting', 90_000, 'working', 'b')]}
          enabled
          notifier={notifier}
          settings={minWork}
        />,
      );
      await wait();
      expect(notifier).toHaveBeenCalledTimes(1);
      expect(notifier.mock.calls[0]?.[0]).toMatchObject({ message: 'b が入力待ちになりました' });
      unmount();
    });

    it('作業を始めた時刻が分からない完了は通知する', async () => {
      const notifier = vi.fn();
      const { unmount } = render(
        <Harness
          transitions={[event('waiting', 1000)]}
          enabled
          notifier={notifier}
          settings={settings({ minWorkSeconds: 600 })}
        />,
      );
      await wait();
      expect(notifier).toHaveBeenCalledTimes(1);
      unmount();
    });

    it('通知音を切ると silent を付ける', async () => {
      const notifier = vi.fn();
      const { unmount } = render(
        <Harness
          transitions={[event('waiting', 0)]}
          enabled
          notifier={notifier}
          settings={settings({ sound: false })}
        />,
      );
      await wait();
      expect(notifier.mock.calls[0]?.[0]).toMatchObject({ silent: true });
      unmount();
    });

    it('通知を ON に戻しても、切っている間の遷移は通知しない', async () => {
      const notifier = vi.fn();
      const transitions = [event('waiting', 0)];
      const { rerender, unmount } = render(
        <Harness transitions={transitions} enabled={false} notifier={notifier} />,
      );
      await wait();
      rerender(<Harness transitions={transitions} enabled notifier={notifier} />);
      await wait();
      expect(notifier).not.toHaveBeenCalled();
      unmount();
    });
  });
});
