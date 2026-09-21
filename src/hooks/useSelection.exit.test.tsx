import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '../types/agent.js';

const exitMock = vi.hoisted(() => vi.fn());

// useApp().exit() が呼ばれたことを検証するため ink の useApp だけ差し替える
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return { ...actual, useApp: () => ({ exit: exitMock }) };
});

const { useSelection } = await import('./useSelection.js');

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

const agent: Agent = {
  sessionId: 'a',
  name: 'a',
  cwd: '/tmp',
  kind: 'interactive',
  startedAt: 0,
  state: 'waiting',
  rawState: 'idle',
  pid: undefined,
  id: undefined,
  meta: undefined,
};

const Harness = () => {
  useSelection({ agents: [agent], onRefresh: vi.fn(), onToggleNotify: vi.fn(() => true), copy: () => true });
  return <Text>ok</Text>;
};

describe('useSelection の終了操作', () => {
  beforeEach(() => {
    exitMock.mockReset();
  });

  it('q で終了する', async () => {
    const { stdin, unmount } = render(<Harness />);
    stdin.write('q');
    await wait();
    expect(exitMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('Ctrl+C は Ink が処理するため useInput へは届かない', async () => {
    const { stdin, unmount } = render(<Harness />);
    stdin.write(String.fromCharCode(3));
    await wait();
    expect(exitMock).not.toHaveBeenCalled();
    unmount();
  });

  it('その他のキーでは終了しない', async () => {
    const { stdin, unmount } = render(<Harness />);
    stdin.write('x');
    await wait();
    expect(exitMock).not.toHaveBeenCalled();
    unmount();
  });
});
