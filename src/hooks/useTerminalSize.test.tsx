import { EventEmitter } from 'node:events';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** columns / rows を差し替えられる stdout のスタブ */
class FakeStdout extends EventEmitter {
  columns: number | undefined = 100;
  rows: number | undefined = 40;
  write = () => undefined;
}

const stdoutRef = vi.hoisted(() => ({ current: undefined as unknown }));

// 端末サイズを自由に操作するため ink の useStdout だけ差し替える
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return { ...actual, useStdout: () => ({ stdout: stdoutRef.current, write: () => undefined }) };
});

const { FALLBACK_COLUMNS, FALLBACK_ROWS, useTerminalSize } = await import('./useTerminalSize.js');

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

const Harness = () => {
  const { columns, rows } = useTerminalSize();
  return <Text>{`${columns}x${rows}`}</Text>;
};

describe('useTerminalSize', () => {
  let stdout: FakeStdout;

  beforeEach(() => {
    stdout = new FakeStdout();
    stdoutRef.current = stdout;
  });

  it('端末の桁数と行数を返す', () => {
    const { lastFrame, unmount } = render(<Harness />);
    expect(lastFrame()).toBe('100x40');
    unmount();
  });

  it('columns / rows が取れない場合は既定値を返す', () => {
    stdout.columns = undefined;
    stdout.rows = undefined;
    const { lastFrame, unmount } = render(<Harness />);
    expect(lastFrame()).toBe(`${FALLBACK_COLUMNS}x${FALLBACK_ROWS}`);
    unmount();
  });

  it('stdout が無い場合は既定値を返す', () => {
    stdoutRef.current = undefined;
    const { lastFrame, unmount } = render(<Harness />);
    expect(lastFrame()).toBe(`${FALLBACK_COLUMNS}x${FALLBACK_ROWS}`);
    unmount();
  });

  it('resize イベントでサイズを更新する', async () => {
    const { lastFrame, unmount } = render(<Harness />);
    expect(lastFrame()).toBe('100x40');

    stdout.columns = 42;
    stdout.rows = 12;
    stdout.emit('resize');
    await wait();

    expect(lastFrame()).toBe('42x12');
    unmount();
  });

  it('アンマウント時に resize リスナーを解除する', () => {
    const { unmount } = render(<Harness />);
    expect(stdout.listenerCount('resize')).toBe(1);
    unmount();
    expect(stdout.listenerCount('resize')).toBe(0);
  });
});
