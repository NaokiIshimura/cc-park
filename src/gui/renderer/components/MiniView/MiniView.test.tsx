// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '../../../../types/agent.js';
import type { AgentGroup } from '../../../../shared/groupAgents.js';
import { getFrame } from '../../../../shared/characters.js';
import { MiniView } from './index.js';

const HOME = '/Users/naoki';

const agent = (sessionId: string, overrides: Partial<Agent> = {}): Agent => ({
  sessionId,
  name: sessionId,
  cwd: `${HOME}/GitHub/app`,
  kind: 'interactive',
  startedAt: 0,
  state: 'working',
  rawState: 'busy',
  pid: undefined,
  id: undefined,
  meta: undefined,
  launchApp: undefined,
  ...overrides,
});

const twoGroups: AgentGroup[] = [
  { cwd: `${HOME}/GitHub/app`, agents: [agent('a'), agent('b')] },
  { cwd: '/tmp/work', agents: [agent('c', { cwd: '/tmp/work', state: 'waiting' })] },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const setup = (overrides: Partial<Parameters<typeof MiniView>[0]> = {}) => {
  const onExpand = vi.fn();
  const onToggleLayout = vi.fn();
  const onResize = vi.fn();
  const result = render(
    <MiniView
      groups={twoGroups}
      frame={0}
      home={HOME}
      layout="vertical"
      onToggleLayout={onToggleLayout}
      onExpand={onExpand}
      onResize={onResize}
      {...overrides}
    />,
  );
  return { ...result, onExpand, onToggleLayout, onResize, user: userEvent.setup() };
};

describe('MiniView', () => {
  it('セッションごとに AA と名前のタイルを出す', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.mini-tile')).toHaveLength(3);
    expect(screen.getByText('a')).toBeDefined();
    expect(container.querySelector('.character')?.textContent).toBe(getFrame('working', 0));
  });

  it('グループごとにディレクトリ名の見出しを出し、ツールチップに cwd を出す', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'app' }).getAttribute('title')).toBe('~/GitHub/app');
    expect(screen.getByRole('heading', { name: 'work' }).getAttribute('title')).toBe('/tmp/work');
  });

  it('cwd が空のグループは (不明) と表示し、ツールチップは出さない', () => {
    setup({ groups: [{ cwd: '', agents: [agent('a', { cwd: '' })] }] });
    expect(screen.getByRole('heading', { name: '(不明)' }).getAttribute('title')).toBeNull();
  });

  it('タイルは選択できない', async () => {
    const { container, user } = setup();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByRole('option')).toBeNull();
    await user.click(container.querySelector('.mini-tile') as HTMLElement);
    expect(container.querySelector('[aria-selected]')).toBeNull();
  });

  it('名前と状態をツールチップに出す', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.mini-tile')[2]?.getAttribute('title')).toMatch(/^c\nIDLE /);
  });

  it('0 件なら一覧の代わりに案内を出す', () => {
    setup({ groups: [] });
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('no sessions')).toBeDefined();
  });

  it('「開く」で広げる操作を通知する', async () => {
    const { onExpand, user } = setup();
    await user.click(screen.getByRole('button', { name: '開く' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('縦 1 列では横 1 列へ切り替えるボタンを出す', () => {
    const { container } = setup({ layout: 'vertical' });
    expect(container.querySelector('.mini-view--horizontal')).toBeNull();
    expect(screen.getByRole('button', { name: '横向' }).getAttribute('title')).toBe('横 1 列に並べる');
  });

  it('横 1 列では横並びのクラスを付け、縦 1 列へ切り替えるボタンを出す', () => {
    const { container } = setup({ layout: 'horizontal' });
    expect(container.querySelector('.mini-view--horizontal')).not.toBeNull();
    expect(screen.getByRole('button', { name: '縦向' }).getAttribute('title')).toBe('縦 1 列に並べる');
  });

  it.each([
    ['vertical', '横向'],
    ['horizontal', '縦向'],
  ] as const)('%s では並びの切り替え（%s）・開くの順にボタンを置く', (layout, label) => {
    setup({ layout });
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      label,
      '開く',
    ]);
  });

  it('並びの切り替えを通知する', async () => {
    const { onToggleLayout, user } = setup();
    await user.click(screen.getByRole('button', { name: '横向' }));
    expect(onToggleLayout).toHaveBeenCalledTimes(1);
  });

  it('描画した大きさを通知する', () => {
    const { onResize } = setup();
    // jsdom はレイアウトを計算しないため、大きさは 0 になる
    expect(onResize).toHaveBeenCalledWith({ width: 0, height: 0 });
  });

  describe('ResizeObserver がある場合', () => {
    let callback: (() => void) | undefined;
    const disconnect = vi.fn();

    const stubObserver = () => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(next: () => void) {
            callback = next;
          }
          observe = vi.fn();
          disconnect = disconnect;
        },
      );
    };

    it('大きさが変わったときだけ通知し直す', () => {
      stubObserver();
      const { onResize, container } = setup();
      const element = container.querySelector('.mini-view') as HTMLElement;

      callback?.();
      expect(onResize).toHaveBeenCalledTimes(1);

      element.getBoundingClientRect = () => ({ width: 120, height: 80 }) as DOMRect;
      callback?.();
      expect(onResize).toHaveBeenLastCalledWith({ width: 120, height: 80 });
      expect(onResize).toHaveBeenCalledTimes(2);
    });

    it('外すときに監視をやめる', () => {
      stubObserver();
      const { unmount } = setup();
      unmount();
      expect(disconnect).toHaveBeenCalled();
    });
  });
});
