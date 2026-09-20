import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { useAnimationTick } from './useAnimationTick.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const Harness = ({ intervalMs, enabled }: { readonly intervalMs: number; readonly enabled?: boolean }) => {
  const frame = useAnimationTick(intervalMs, enabled);
  return <Text>{String(frame)}</Text>;
};

describe('useAnimationTick', () => {
  it('0 から始まる', () => {
    const { lastFrame, unmount } = render(<Harness intervalMs={10_000} />);
    expect(lastFrame()).toBe('0');
    unmount();
  });

  it('一定間隔でフレームが進む', async () => {
    const { lastFrame, unmount } = render(<Harness intervalMs={20} />);
    await wait(120);
    expect(Number(lastFrame())).toBeGreaterThan(1);
    unmount();
  });

  it('enabled が false なら進まない', async () => {
    const { lastFrame, unmount } = render(<Harness intervalMs={20} enabled={false} />);
    await wait(120);
    expect(lastFrame()).toBe('0');
    unmount();
  });

  it('アンマウント後はタイマーが止まる', async () => {
    const { lastFrame, unmount } = render(<Harness intervalMs={20} />);
    await wait(60);
    unmount();

    // アンマウント直後の値を基準にし、以降更新されないことを確認する
    const afterUnmount = lastFrame();
    await wait(120);
    expect(lastFrame()).toBe(afterUnmount);
  });
});
