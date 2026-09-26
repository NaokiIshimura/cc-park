// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Subagent } from '../../../../types/agent.js';
import { getMiniFrame } from '../../../../shared/characters.js';
import { AgentRow } from './index.js';

const HOME = '/Users/naoki';
const NOW = 1_000_000;

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  sessionId: 'session-1',
  name: 'worker',
  cwd: `${HOME}/GitHub/app`,
  kind: 'interactive',
  startedAt: NOW - 60_000,
  state: 'working',
  rawState: 'busy',
  pid: 1,
  id: undefined,
  meta: undefined,
  ...overrides,
});

afterEach(cleanup);

const setup = (overrides: Partial<Parameters<typeof AgentRow>[0]> = {}) => {
  const onSelect = vi.fn();
  const onCopy = vi.fn();
  const result = render(
    <AgentRow
      agent={agent()}
      frame={0}
      selected={false}
      now={NOW}
      isSelf={false}
      scheduledLaunch={undefined}
      showPrompt
      showTokens
      showSubagents
      onSelect={onSelect}
      onCopy={onCopy}
      {...overrides}
    />,
  );
  return { ...result, onSelect, onCopy, user: userEvent.setup() };
};

describe('AgentRow', () => {
  it('セッション名を表示する', () => {
    setup();
    expect(screen.getByText('worker')).toBeDefined();
  });

  it('cwd はグループ見出しへ移したので行には出さない', () => {
    setup();
    expect(screen.queryByText('~/GitHub/app')).toBeNull();
  });

  it('状態ラベルと説明・経過時間を表示する', () => {
    setup();
    expect(screen.getByText('BUSY')).toBeDefined();
    expect(screen.getByText('working... 1m')).toBeDefined();
  });

  it('未知の状態では生の状態文字列を添える', () => {
    setup({ agent: agent({ state: 'unknown', rawState: 'weird' }) });
    expect(screen.getByText(/unknown state \(weird\)/)).toBeDefined();
  });

  it('起動時刻が無ければ経過時間を - にする', () => {
    setup({ agent: agent({ startedAt: 0 }) });
    expect(screen.getByText(/working\.\.\. -/)).toBeDefined();
  });

  it('background セッションには [bg] を付ける', () => {
    setup({ agent: agent({ kind: 'background' }) });
    expect(screen.getByText('[bg]')).toBeDefined();
  });

  it('interactive セッションには [bg] を付けない', () => {
    setup();
    expect(screen.queryByText('[bg]')).toBeNull();
  });

  it('予約から起動したセッションには [sched] を付け、予約の時刻をツールチップに出す', () => {
    setup({
      agent: agent({ kind: 'background' }),
      scheduledLaunch: { agentId: 'bf96c05e', scheduleId: 's1', time: '09:00', firedAt: 0 },
    });
    expect(screen.getByText('[sched]').getAttribute('title')).toBe('09:00 の予約で起動');
  });

  it('予約から起動していなければ [sched] を付けない', () => {
    setup({ agent: agent({ kind: 'background' }) });
    expect(screen.queryByText('[sched]')).toBeNull();
  });

  it('自分自身のセッションには [self] を付ける', () => {
    setup({ isSelf: true });
    expect(screen.getByText('[self]')).toBeDefined();
  });

  it('自分以外には [self] を付けない', () => {
    setup();
    expect(screen.queryByText('[self]')).toBeNull();
  });

  it('選択中は選択済みとして扱われる', () => {
    setup({ selected: true });
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('true');
  });

  it('未選択なら選択済みにしない', () => {
    setup();
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('false');
  });

  it('クリックで選択する', async () => {
    const { onSelect, user } = setup();
    await user.click(screen.getByRole('option'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('ダブルクリックでコピーする', async () => {
    const { onCopy, user } = setup();
    await user.dblClick(screen.getByRole('option'));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});

describe('AgentRow の付加情報', () => {
  it('最終プロンプトを目印付きで表示する', () => {
    setup({ agent: agent({ meta: { lastPrompt: 'テストを書いて', tokens: undefined , subagents: [] } }) });
    expect(screen.getByText('> テストを書いて')).toBeDefined();
  });

  it('最終プロンプトが無くても目印だけは出して行数を揃える', () => {
    const { container } = setup();
    expect(container.querySelector('.agent-row__prompt')?.textContent).toBe('>');
  });

  it('名前・状態・プロンプトの順に並べる', () => {
    const { container } = setup({
      agent: agent({ meta: { lastPrompt: 'やって', tokens: undefined , subagents: [] } }),
    });
    const lines = container.querySelectorAll('.agent-row__line');
    expect(lines[0]?.querySelector('.agent-row__name')).not.toBeNull();
    expect(lines[1]?.querySelector('.status-badge')).not.toBeNull();
    expect(lines[2]?.querySelector('.agent-row__prompt')).not.toBeNull();
  });

  it('コンテキスト利用率をパーセントで表示する', () => {
    const { container } = setup({
      agent: agent({
        meta: { lastPrompt: undefined, tokens: { used: 90_000, limit: 200_000, ratio: 0.45 } , subagents: [] },
      }),
    });
    // 桁を揃えるための空白が潰れないよう、要素の textContent を直接見る
    expect(container.querySelector('.token__percent')?.textContent).toBe('ctx  45%');
  });

  it('バーは使用率のぶんだけセグメントを塗る', () => {
    const { container } = setup({
      agent: agent({
        meta: { lastPrompt: undefined, tokens: { used: 90_000, limit: 200_000, ratio: 0.45 } , subagents: [] },
      }),
    });
    expect(container.querySelectorAll('.token__segment')).toHaveLength(8);
    expect(container.querySelectorAll('.token__segment--on')).toHaveLength(4);
  });

  it('トークン情報が無ければ ctx を出さない', () => {
    const { container } = setup();
    expect(container.querySelector('.token')).toBeNull();
  });

  it('showPrompt が false ならプロンプト行を出さない', () => {
    const { container } = setup({
      agent: agent({ meta: { lastPrompt: 'やって', tokens: undefined , subagents: [] } }),
      showPrompt: false,
    });
    expect(container.querySelector('.agent-row__prompt')).toBeNull();
  });

  it('showTokens が false なら ctx を出さない', () => {
    const { container } = setup({
      agent: agent({
        meta: { lastPrompt: undefined, tokens: { used: 1, limit: 200_000, ratio: 0.5 } , subagents: [] },
      }),
      showTokens: false,
    });
    expect(container.querySelector('.token')).toBeNull();
  });
});

describe('AgentRow のミニキャラクター', () => {
  const subagent = (toolUseId: string, description: string): Subagent => ({
    toolUseId,
    type: 'general-purpose',
    description,
    startedAt: undefined,
  });

  const withSubagents = (subagents: readonly Subagent[], state: Agent['state'] = 'working') =>
    agent({ state, meta: { lastPrompt: undefined, tokens: undefined, subagents } });

  const many = (count: number) =>
    Array.from({ length: count }, (_, index) => subagent(`toolu_${index}`, `作業${index}`));

  /** 描画されたミニキャラクターの並び。 */
  const minis = (container: HTMLElement) =>
    [...container.querySelectorAll('.mini')].map((element) => element.textContent);

  it('サブエージェントが走っていれば体数ぶんミニキャラクターを出す', () => {
    const { container } = setup({ agent: withSubagents(many(2)) });
    expect(minis(container)).toEqual([getMiniFrame(0), getMiniFrame(1)]);
  });

  it('3 体を超えても省略しない', () => {
    const { container } = setup({ agent: withSubagents(many(7)) });
    expect(minis(container)).toHaveLength(7);
  });

  /*
   * 折り返しは CSS（flex-wrap）に任せる。jsdom はレイアウトを計算しないので、
   * ここでは折り返しの受け皿になる入れ物が出ていることだけ確かめる。
   */
  it('ミニキャラクターは折り返せる入れ物に入れる', () => {
    const { container } = setup({ agent: withSubagents(many(2)) });
    expect(container.querySelector('.agent-row__subagents')).not.toBeNull();
  });

  it('サブエージェントがいなければ入れ物ごと出さない', () => {
    const { container } = setup({ agent: withSubagents([]) });
    expect(container.querySelector('.agent-row__subagents')).toBeNull();
    expect(minis(container)).toEqual([]);
  });

  it('待機中のセッションでも出す', () => {
    // 非同期サブエージェントは親がユーザーへ応答を返したあとも走り続ける
    const { container } = setup({ agent: withSubagents(many(2), 'waiting') });
    expect(minis(container)).toHaveLength(2);
  });

  it('終了済みのセッションでは出さない', () => {
    const { container } = setup({ agent: withSubagents(many(2), 'done') });
    expect(minis(container)).toEqual([]);
  });

  it('showSubagents が false なら出さない', () => {
    const { container } = setup({ agent: withSubagents(many(2)), showSubagents: false });
    expect(minis(container)).toEqual([]);
  });

  it('何を走らせているかをツールチップに出す', () => {
    const { container } = setup({
      agent: withSubagents([subagent('toolu_1', '調査'), subagent('toolu_2', '検証')]),
    });

    expect(container.querySelector('.agent-row')?.getAttribute('title')).toBe(
      'general-purpose: 調査\ngeneral-purpose: 検証',
    );
  });

  it('サブエージェントがいなければツールチップを付けない', () => {
    const { container } = setup({ agent: withSubagents([]) });
    expect(container.querySelector('.agent-row')?.getAttribute('title')).toBeNull();
  });
});
