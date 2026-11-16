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
  /** 既定は 0（完了もすぐ通知する）。状態が続くのを待つ挙動を確かめるときだけ指定する */
  readonly settleMs?: number;
}

const Harness = ({ transitions, enabled, notifier, settings, settleMs = 0 }: HarnessProps) => {
  useNotifications(transitions, {
    enabled,
    notifier: notifier as never,
    settleMs,
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

  describe('完了の状態が続くのを待ってから通知する（#84）', () => {
    const SETTLE = 150;

    it('完了と作業を行き来している間は通知せず、完了が続いたら 1 回だけ通知する', async () => {
      const notifier = vi.fn();
      const { rerender, unmount } = render(
        <Harness
          transitions={[event('waiting', 0)]}
          enabled
          notifier={notifier}
          settleMs={SETTLE}
        />,
      );
      await wait();
      for (const [index, next] of [
        event('working', 2000, 'waiting'),
        event('waiting', 4000),
        event('working', 6000, 'waiting'),
        event('waiting', 8000),
      ].entries()) {
        rerender(<Harness transitions={[next]} enabled notifier={notifier} settleMs={SETTLE} />);
        await wait();
        expect(notifier, `${index} 回目の遷移の直後`).not.toHaveBeenCalled();
      }
      await wait(SETTLE + 50);
      expect(notifier).toHaveBeenCalledTimes(1);
      expect(notifier.mock.calls[0]?.[0]).toMatchObject({ message: 'a が入力待ちになりました' });
      unmount();
    });

    it('待っている間に作業へ戻ったら通知しない', async () => {
      const notifier = vi.fn();
      const { rerender, unmount } = render(
        <Harness
          transitions={[event('waiting', 0)]}
          enabled
          notifier={notifier}
          settleMs={SETTLE}
        />,
      );
      await wait();
      rerender(
        <Harness
          transitions={[event('working', 2000, 'waiting')]}
          enabled
          notifier={notifier}
          settleMs={SETTLE}
        />,
      );
      await wait(SETTLE + 50);
      expect(notifier).not.toHaveBeenCalled();
      unmount();
    });

    it('バックグラウンドの完了も、作業へ戻ったら通知しない', async () => {
      const notifier = vi.fn();
      const { rerender, unmount } = render(
        <Harness transitions={[event('done', 0)]} enabled notifier={notifier} settleMs={SETTLE} />,
      );
      await wait();
      rerender(
        <Harness
          transitions={[event('working', 2000, 'done')]}
          enabled
          notifier={notifier}
          settleMs={SETTLE}
        />,
      );
      await wait(SETTLE + 50);
      expect(notifier).not.toHaveBeenCalled();
      unmount();
    });

    it('承認待ちは待たずにすぐ通知する', async () => {
      const notifier = vi.fn();
      const { unmount } = render(
        <Harness
          transitions={[event('blocked', 0)]}
          enabled
          notifier={notifier}
          settleMs={60_000}
        />,
      );
      await wait();
      expect(notifier).toHaveBeenCalledTimes(1);
      unmount();
    });

    it('待っている間に通知を切ったら出さない', async () => {
      const notifier = vi.fn();
      const transitions = [event('waiting', 0)];
      const { rerender, unmount } = render(
        <Harness transitions={transitions} enabled notifier={notifier} settleMs={SETTLE} />,
      );
      await wait();
      rerender(
        <Harness transitions={transitions} enabled={false} notifier={notifier} settleMs={SETTLE} />,
      );
      await wait(SETTLE + 50);
      expect(notifier).not.toHaveBeenCalled();
      unmount();
    });

    it('アンマウントしたら待っていた通知を出さない', async () => {
      const notifier = vi.fn();
      const { unmount } = render(
        <Harness
          transitions={[event('waiting', 0)]}
          enabled
          notifier={notifier}
          settleMs={SETTLE}
        />,
      );
      await wait();
      unmount();
      await wait(SETTLE + 50);
      expect(notifier).not.toHaveBeenCalled();
    });

    it('完了をはさんで作業へ戻っても、作業時間は最初に作業を始めた時刻から数える', async () => {
      const notifier = vi.fn();
      const minWork = { ...DEFAULT_NOTIFICATION_SETTINGS, minWorkSeconds: 60 };
      const steps = [
        event('working', 0, 'waiting'),
        event('waiting', 50_000),
        event('working', 52_000, 'waiting'),
        // 作業へ戻ってからは 18 秒だが、最初に始めてからは 70 秒
        event('waiting', 70_000),
      ];
      const { rerender, unmount } = render(
        <Harness
          transitions={[steps[0]!]}
          enabled
          notifier={notifier}
          settings={minWork}
          settleMs={SETTLE}
        />,
      );
      await wait();
      for (const step of steps.slice(1)) {
        rerender(
          <Harness
            transitions={[step]}
            enabled
            notifier={notifier}
            settings={minWork}
            settleMs={SETTLE}
          />,
        );
        await wait();
      }
      await wait(SETTLE + 50);
      expect(notifier).toHaveBeenCalledTimes(1);
      unmount();
    });
  });
});
