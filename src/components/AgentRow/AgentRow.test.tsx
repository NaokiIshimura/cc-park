import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { Agent, AgentKind, CharacterState } from '../../types/agent.js';
import { AgentRow } from './index.js';

const NOW = 1_800_000_000_000;

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  sessionId: 'session-a',
  name: 'watcher',
  cwd: '/Users/naoki/GitHub/app',
  kind: 'interactive' as AgentKind,
  startedAt: NOW - 192_000,
  state: 'working' as CharacterState,
  rawState: 'busy',
  pid: 100,
  id: undefined,
  ...overrides,
});

const renderRow = (overrides: Partial<Agent> = {}, props: Partial<Parameters<typeof AgentRow>[0]> = {}) =>
  render(
    <AgentRow
      agent={agent(overrides)}
      frame={0}
      selected={false}
      now={NOW}
      isSelf={false}
      infoWidth={60}
      {...props}
    />,
  ).lastFrame() ?? '';

describe('AgentRow', () => {
  it('セッション名を表示する', () => {
    expect(renderRow()).toContain('watcher');
  });

  it('経過時間を表示する', () => {
    expect(renderRow()).toContain('3m12s');
  });

  it('startedAt が 0 の場合は経過時間を - にする', () => {
    expect(renderRow({ startedAt: 0 })).toContain('-');
  });

  it('cwd を短縮して表示する', () => {
    expect(renderRow({ cwd: '/tmp/work' })).toContain('/tmp/work');
  });

  it('ステータスラベルを表示する', () => {
    expect(renderRow()).toContain('BUSY');
  });

  it('状態の説明を表示する', () => {
    expect(renderRow()).toContain('working...');
  });

  it('background セッションには [bg] バッジを付ける', () => {
    expect(renderRow({ kind: 'background' })).toContain('[bg]');
  });

  it('interactive セッションには [bg] バッジを付けない', () => {
    expect(renderRow()).not.toContain('[bg]');
  });

  it('自分自身のセッションには [self] バッジを付ける', () => {
    expect(renderRow({}, { isSelf: true })).toContain('[self]');
  });

  it('選択行には > を付ける', () => {
    expect(renderRow({}, { selected: true })).toContain('>');
  });

  it('非選択行には > を付けない', () => {
    expect(renderRow()).not.toContain('>');
  });

  it('未知の状態では生の状態文字列を併記する', () => {
    const output = renderRow({ state: 'unknown', rawState: 'hibernating' });
    expect(output).toContain('hibernating');
    expect(output).toContain('UNKNOWN');
  });

  it('生の状態が空の未知状態では括弧を付けない', () => {
    expect(renderRow({ state: 'unknown', rawState: '' })).not.toContain('()');
  });

  it('キャラクターの AA を表示する', () => {
    expect(renderRow()).toContain('( \\_/)');
  });
});

describe('AgentRow のレイアウト', () => {
  it('infoWidth を超える行は折り返さず切り詰める', () => {
    const output = renderRow(
      { name: 'とても長い日本語のセッション名です', cwd: '/Users/naoki/very/long/path/to/project' },
      { infoWidth: 30 },
    );
    const lines = output.split('\n').filter((line) => line.trim() !== '');

    // キャラクター 2 行分に収まり、折り返しで 3 行目が生まれない
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(30 + 12);
    }
  });

  it('幅が狭くてもキャラクターは欠けない', () => {
    const output = renderRow({}, { infoWidth: 20 });
    expect(output).toContain('( \\_/)');
  });
});
