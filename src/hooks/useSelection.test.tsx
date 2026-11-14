import { Text } from 'ink';
import { useState } from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '../types/agent.js';
import { useSelection, type UseSelectionOptions } from './useSelection.js';

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

const ESC = String.fromCharCode(27);
const ARROW_UP = `${ESC}[A`;
const ARROW_DOWN = `${ESC}[B`;
const ENTER = String.fromCharCode(13);

const agent = (sessionId: string): Agent => ({
  sessionId,
  name: sessionId,
  cwd: '/tmp',
  kind: 'interactive',
  startedAt: 0,
  state: 'waiting',
  rawState: 'idle',
  pid: undefined,
  id: undefined,
  meta: undefined,
  launchApp: undefined,
});

const Harness = (props: UseSelectionOptions) => {
  const { selectedIndex, selectedSessionId, message } = useSelection(props);
  return <Text>{JSON.stringify({ selectedIndex, selectedSessionId, message })}</Text>;
};

const parse = (frame: string | undefined) =>
  // 端末幅で折り返された改行を取り除いてから読む
  JSON.parse((frame ?? '{}').replaceAll('\n', '')) as {
    selectedIndex: number;
    selectedSessionId: string | null;
    message: string | null;
  };

const setup = (overrides: Partial<UseSelectionOptions> = {}) => {
  const onRefresh = vi.fn();
  const onToggleNotify = vi.fn(() => true);
  const copy = vi.fn(() => true);
  const result = render(
    <Harness
      agents={[agent('a'), agent('b'), agent('c')]}
      onRefresh={onRefresh}
      onToggleNotify={onToggleNotify}
      copy={copy}
      {...overrides}
    />,
  );
  return { ...result, onRefresh, onToggleNotify, copy };
};

describe('useSelection', () => {
  it('初期選択は先頭', () => {
    const { lastFrame, unmount } = setup();
    expect(parse(lastFrame())).toMatchObject({ selectedIndex: 0, selectedSessionId: 'a' });
    unmount();
  });

  it('j で次へ移動する', async () => {
    const { stdin, lastFrame, unmount } = setup();
    stdin.write('j');
    await wait();
    expect(parse(lastFrame()).selectedSessionId).toBe('b');
    unmount();
  });

  it('k で前へ移動する', async () => {
    const { stdin, lastFrame, unmount } = setup();
    stdin.write('k');
    await wait();
    expect(parse(lastFrame()).selectedSessionId).toBe('c');
    unmount();
  });

  it('下矢印で次へ移動する', async () => {
    const { stdin, lastFrame, unmount } = setup();
    stdin.write(ARROW_DOWN);
    await wait();
    expect(parse(lastFrame()).selectedSessionId).toBe('b');
    unmount();
  });

  it('上矢印で前へ移動する', async () => {
    const { stdin, lastFrame, unmount } = setup();
    stdin.write(ARROW_UP);
    await wait();
    expect(parse(lastFrame()).selectedSessionId).toBe('c');
    unmount();
  });

  it('末尾から次へ移動すると先頭へ循環する', async () => {
    const { stdin, lastFrame, unmount } = setup();
    stdin.write('j');
    await wait();
    stdin.write('j');
    await wait();
    expect(parse(lastFrame()).selectedSessionId).toBe('c');
    stdin.write('j');
    await wait();
    expect(parse(lastFrame()).selectedSessionId).toBe('a');
    unmount();
  });

  it('キーがまとめて届いても 1 文字ずつ処理する', async () => {
    const { stdin, lastFrame, unmount } = setup();
    stdin.write('jj');
    await wait();
    expect(parse(lastFrame()).selectedIndex).toBe(2);
    unmount();
  });

  it('c で resume コマンドをコピーする', async () => {
    const { stdin, lastFrame, copy, unmount } = setup();
    stdin.write('c');
    await wait();
    expect(copy).toHaveBeenCalledWith('cd /tmp && claude --resume a');
    expect(parse(lastFrame()).message).toContain('cd /tmp && claude --resume a');
    unmount();
  });

  it('Enter ではコピーしない', async () => {
    const { stdin, copy, unmount } = setup();
    stdin.write(ENTER);
    await wait();
    expect(copy).not.toHaveBeenCalled();
    unmount();
  });

  it('コピー非対応の環境ではその旨を表示する', async () => {
    const { stdin, lastFrame, unmount } = setup({ copy: vi.fn(() => false) });
    stdin.write('c');
    await wait();
    expect(parse(lastFrame()).message).toContain('コピー非対応');
    unmount();
  });

  it('r で更新を呼ぶ', async () => {
    const { stdin, lastFrame, onRefresh, unmount } = setup();
    stdin.write('r');
    await wait();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(parse(lastFrame()).message).toBe('更新しました');
    unmount();
  });

  it('n で通知トグルを呼ぶ', async () => {
    const { stdin, onToggleNotify, unmount } = setup();
    stdin.write('n');
    await wait();
    expect(onToggleNotify).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('n で ON になったことをメッセージで知らせる', async () => {
    const { stdin, lastFrame, unmount } = setup({ onToggleNotify: vi.fn(() => true) });
    stdin.write('n');
    await wait();
    expect(parse(lastFrame()).message).toBe('OS 通知を ON にしました');
    unmount();
  });

  it('n で OFF になったことをメッセージで知らせる', async () => {
    const { stdin, lastFrame, unmount } = setup({ onToggleNotify: vi.fn(() => false) });
    stdin.write('n');
    await wait();
    expect(parse(lastFrame()).message).toBe('OS 通知を OFF にしました');
    unmount();
  });

  it('通知非対応の環境では切り替えずにその旨を知らせる', async () => {
    const onToggleNotify = vi.fn(() => true);
    const { stdin, lastFrame, unmount } = setup({ onToggleNotify, notifySupported: false });
    stdin.write('n');
    await wait();
    expect(onToggleNotify).not.toHaveBeenCalled();
    expect(parse(lastFrame()).message).toBe('OS 通知は macOS のみ対応しています');
    unmount();
  });

  it('セッションが 0 件なら移動もコピーもしない', async () => {
    const { stdin, lastFrame, copy, unmount } = setup({ agents: [] });
    stdin.write('j');
    await wait();
    stdin.write('c');
    await wait();
    expect(copy).not.toHaveBeenCalled();
    expect(parse(lastFrame())).toMatchObject({ selectedIndex: 0, selectedSessionId: null });
    unmount();
  });

  it('enabled が false ならキー入力を無視する', async () => {
    const { stdin, onRefresh, unmount } = setup({ enabled: false });
    stdin.write('r');
    await wait();
    expect(onRefresh).not.toHaveBeenCalled();
    unmount();
  });

  it('一覧が縮んだらカーソルを範囲内へ補正する', async () => {
    const props = {
      agents: [agent('a'), agent('b'), agent('c')],
      onRefresh: vi.fn(),
      onToggleNotify: vi.fn(() => true),
      copy: vi.fn(() => true),
    };
    const { stdin, rerender, lastFrame, unmount } = render(<Harness {...props} />);

    stdin.write('j');
    await wait();
    stdin.write('j');
    await wait();
    expect(parse(lastFrame()).selectedIndex).toBe(2);

    rerender(<Harness {...props} agents={[agent('a')]} />);
    await wait();
    expect(parse(lastFrame())).toMatchObject({ selectedIndex: 0, selectedSessionId: 'a' });
    unmount();
  });
});

/** 検索語を親で持つ形の確認用。 */
const SearchHarness = (props: Omit<UseSelectionOptions, 'query' | 'onQueryChange'>) => {
  const [query, setQuery] = useState('');
  const { searching, message } = useSelection({ ...props, query, onQueryChange: setQuery });
  return <Text>{JSON.stringify({ query, searching, message })}</Text>;
};

const setupSearch = (overrides: Partial<UseSelectionOptions> = {}) => {
  const onRefresh = vi.fn();
  const onToggleFilter = vi.fn(() => true);
  const result = render(
    <SearchHarness
      agents={[agent('a'), agent('b')]}
      onRefresh={onRefresh}
      onToggleNotify={vi.fn(() => true)}
      onToggleFilter={onToggleFilter}
      copy={vi.fn(() => true)}
      {...overrides}
    />,
  );
  const read = () =>
    JSON.parse((result.lastFrame() ?? '{}').replaceAll('\n', '')) as {
      query: string;
      searching: boolean;
      message: string | null;
    };
  return { ...result, onRefresh, onToggleFilter, read };
};

describe('useSelection の絞り込み', () => {
  it('f で操作待ちだけの表示を切り替える', async () => {
    const { stdin, onToggleFilter, read, unmount } = setupSearch();
    stdin.write('f');
    await wait();
    expect(onToggleFilter).toHaveBeenCalledTimes(1);
    expect(read().message).toBe('操作待ちのセッションだけを表示します（f で解除）');
    unmount();
  });

  it('/ で検索を始め、入力した文字は一覧の操作に使わない', async () => {
    const { stdin, onRefresh, read, unmount } = setupSearch();
    stdin.write('/');
    await wait();
    expect(read().searching).toBe(true);
    stdin.write('r');
    await wait();
    stdin.write('e');
    await wait();
    expect(read().query).toBe('re');
    expect(onRefresh).not.toHaveBeenCalled();
    unmount();
  });

  it('Backspace で 1 文字消し、Enter で確定して一覧の操作へ戻る', async () => {
    const { stdin, onRefresh, read, unmount } = setupSearch();
    stdin.write('/');
    await wait();
    stdin.write('ab');
    await wait();
    stdin.write(String.fromCharCode(127));
    await wait();
    expect(read().query).toBe('a');
    stdin.write(ENTER);
    await wait();
    expect(read()).toMatchObject({ query: 'a', searching: false });
    stdin.write('r');
    await wait();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('/ と続く文字がまとめて届いても（貼り付けなど）検索語に入る', async () => {
    const { stdin, onRefresh, read, unmount } = setupSearch();
    stdin.write('/web');
    await wait();
    expect(read()).toMatchObject({ query: 'web', searching: true });
    stdin.write('ri');
    await wait();
    expect(read().query).toBe('webri');
    expect(onRefresh).not.toHaveBeenCalled();
    unmount();
  });

  it('まとめて届いた入力に改行があれば、そこで確定する', async () => {
    const { stdin, read, unmount } = setupSearch();
    stdin.write(`/web${ENTER}`);
    await wait();
    expect(read()).toMatchObject({ query: 'web', searching: false });
    unmount();
  });

  it('入力中の Esc は検索語を消して戻る', async () => {
    const { stdin, read, unmount } = setupSearch();
    stdin.write('/');
    await wait();
    stdin.write('ab');
    await wait();
    stdin.write(ESC);
    await wait();
    expect(read()).toMatchObject({ query: '', searching: false });
    unmount();
  });

  it('確定した検索語も Esc で消せる', async () => {
    const { stdin, read, unmount } = setupSearch();
    stdin.write('/');
    await wait();
    stdin.write('ab');
    await wait();
    stdin.write(ENTER);
    await wait();
    stdin.write(ESC);
    await wait();
    expect(read().query).toBe('');
    unmount();
  });
});
