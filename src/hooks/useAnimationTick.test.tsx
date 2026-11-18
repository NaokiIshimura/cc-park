// @vitest-environment jsdom
import { cleanup, render as renderDom } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAnimationTick } from './useAnimationTick.js';

afterEach(cleanup);

/** フックの結果を文字列で描画し、最後に描画された内容を読めるようにする。 */
const render = (ui: ReactElement) => {
  const result = renderDom(ui);
  // テスト用の tsconfig は DOM の型を持たないため、読む値だけ型を付ける
  const container = result.container as unknown as { readonly textContent: string | null };
  return { ...result, lastFrame: () => container.textContent ?? '' };
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const Harness = ({ intervalMs, enabled }: { readonly intervalMs: number; readonly enabled?: boolean }) => {
  const frame = useAnimationTick(intervalMs, enabled);
  return <span>{String(frame)}</span>;
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
