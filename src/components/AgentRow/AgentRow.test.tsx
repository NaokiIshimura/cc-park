import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { Agent, AgentKind, CharacterState, Subagent } from '../../types/agent.js';
import { buildMiniRows, CHARACTER_WIDTH, getMiniFrame, miniPerRow } from '../../shared/characters.js';
import { AgentRow } from './index.js';

const NOW = 1_800_000_000_000;

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  sessionId: 'session-a',
  name: 'cc-park',
  cwd: '/Users/naoki/GitHub/app',
  kind: 'interactive' as AgentKind,
  startedAt: NOW - 192_000,
  state: 'working' as CharacterState,
  rawState: 'busy',
  pid: 100,
  id: undefined,
  meta: undefined,
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
      showPrompt
      showTokens
      showSubagents
      {...props}
    />,
  ).lastFrame() ?? '';

describe('AgentRow', () => {
  it('セッション名を表示する', () => {
    expect(renderRow()).toContain('cc-park');
  });

  it('経過時間を表示する', () => {
    expect(renderRow()).toContain('3m12s');
  });

  it('startedAt が 0 の場合は経過時間を - にする', () => {
    expect(renderRow({ startedAt: 0 })).toContain('-');
  });

  it('cwd はグループ見出しへ移したので行には出さない', () => {
    expect(renderRow({ cwd: '/tmp/work' })).not.toContain('/tmp/work');
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

  // プロンプト行にも `>` を使うため、カーソルは行頭の桁にあるかで見分ける
  const hasCursor = (output: string): boolean =>
    output.split('\n').some((line) => line.startsWith('>'));

  it('選択行には > を付ける', () => {
    expect(hasCursor(renderRow({}, { selected: true }))).toBe(true);
  });

  it('非選択行には > を付けない', () => {
    expect(hasCursor(renderRow())).toBe(false);
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
    expect(renderRow()).toContain('▐▛███▛█');
  });
});

describe('AgentRow の付加情報', () => {
  const withMeta = (meta: Agent['meta']) => renderRow({ meta });

  it('最終プロンプトを目印付きで表示する', () => {
    expect(withMeta({ lastPrompt: 'テストを書いて', tokens: undefined , subagents: [] })).toContain(
      '> テストを書いて',
    );
  });

  it('最終プロンプトが無くても目印だけは出して行数を揃える', () => {
    const lines = renderRow().split('\n');
    expect(lines[2]?.trimEnd().endsWith('>')).toBe(true);
    expect(lines[2]).not.toContain('> ');
  });

  it('コンテキスト利用率をバーとパーセントで表示する', () => {
    const output = withMeta({
      lastPrompt: undefined,
      tokens: { used: 90_000, limit: 200_000, ratio: 0.45 },
      subagents: [],
    });
    expect(output).toContain('ctx  45%');
    expect(output).toContain('████░░░░');
  });

  it('トークン情報が無ければ ctx を出さない', () => {
    expect(renderRow()).not.toContain('ctx');
  });

  it('showPrompt が false ならプロンプト行を出さない', () => {
    const output = renderRow(
      { meta: { lastPrompt: 'やって', tokens: undefined , subagents: [] } },
      { showPrompt: false },
    );
    expect(output).not.toContain('やって');
  });

  it('showTokens が false なら ctx を出さない', () => {
    const output = renderRow(
      { meta: { lastPrompt: undefined, tokens: { used: 1, limit: 200_000, ratio: 0.5 } , subagents: [] } },
      { showTokens: false },
    );
    expect(output).not.toContain('ctx');
  });

  it('情報カラムが狭いときはトークンを省いて名前を優先する', () => {
    const output = renderRow(
      { meta: { lastPrompt: undefined, tokens: { used: 1, limit: 200_000, ratio: 0.5 } , subagents: [] } },
      { infoWidth: 20 },
    );
    expect(output).not.toContain('ctx');
    expect(output).toContain('cc-park');
  });

  it('showPrompt が有効なら 3 行になり 名前・状態・プロンプトの順に並ぶ', () => {
    const lines = withMeta({ lastPrompt: 'やって', tokens: undefined , subagents: [] }).split('\n');
    expect(lines[0]).toContain('cc-park');
    expect(lines[1]).toContain('BUSY');
    expect(lines[2]).toContain('> やって');
  });

  it('showPrompt が無効なら 2 行になり下揃えで足の行に状態が並ぶ', () => {
    const lines = renderRow({}, { showPrompt: false }).split('\n');
    // AA の 1 行目には情報が無く、2 行目に名前・3 行目に状態が来る
    expect(lines[0]).not.toContain('cc-park');
    expect(lines[1]).toContain('cc-park');
    expect(lines[2]).toContain('BUSY');
  });
});

describe('AgentRow のレイアウト', () => {
  it('状態行は説明と経過時間を右端へ寄せる', () => {
    const lines = renderRow().split('\n');
    const status = lines[1] ?? '';

    expect(status.trimEnd().endsWith('working... 3m12s')).toBe(true);
    // ラベルと説明の間が空き、左詰めのままになっていない
    expect(status).toMatch(/BUSY\s{2,}working\.\.\./);
  });

  it('状態行の右端は 1 行目のトークン表示と揃う', () => {
    const lines = renderRow({
      meta: { lastPrompt: undefined, tokens: { used: 90_000, limit: 200_000, ratio: 0.45 } , subagents: [] },
    }).split('\n');

    expect(lines[1]?.trimEnd().length).toBe(lines[0]?.trimEnd().length);
  });

  it('infoWidth を超える行は折り返さず切り詰める', () => {
    const output = renderRow(
      { name: 'とても長い日本語のセッション名です', cwd: '/Users/naoki/very/long/path/to/project' },
      { infoWidth: 30 },
    );
    const lines = output.split('\n').filter((line) => line.trim() !== '');

    // キャラクター 3 行分に収まり、折り返しで 4 行目が生まれない
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(30 + 12);
    }
  });

  it('幅が狭くてもキャラクターは欠けない', () => {
    const output = renderRow({}, { infoWidth: 20 });
    expect(output).toContain('▐▛███▛█');
  });
});

describe('AgentRow のミニキャラクター', () => {
  const subagent = (toolUseId: string): Subagent => ({
    toolUseId,
    type: 'general-purpose',
    description: '調査',
    startedAt: undefined,
  });

  /** 実行中のサブエージェントを持つセッションを作る。 */
  const withSubagents = (count: number, state: CharacterState = 'working'): Partial<Agent> => ({
    state,
    meta: {
      lastPrompt: undefined,
      tokens: undefined,
      subagents: Array.from({ length: count }, (_, index) => subagent(`toolu_${index}`)),
    },
  });

  /** renderRow が使う infoWidth に対して 1 行に並ぶ体数。 */
  const INFO_WIDTH = 60;
  const PER_ROW = miniPerRow(CHARACTER_WIDTH + 1 + INFO_WIDTH);

  /** ミニキャラクターの行。 */
  const miniLines = (count: number) => buildMiniRows(count, 0, PER_ROW);

  it('サブエージェントが走っていれば AA の下にミニキャラクターを並べる', () => {
    expect(renderRow(withSubagents(2))).toContain(miniLines(2)[0]);
  });

  it('3 体を超えても折り返さず横に並べる', () => {
    const output = renderRow(withSubagents(7));
    expect(miniLines(7)).toHaveLength(1);
    expect(output).toContain(miniLines(7)[0]);
  });

  it('幅いっぱいまで並んだら折り返し、行の間を 1 行空ける', () => {
    // 幅を狭めて折り返させる
    const narrow = 10;
    const perRow = miniPerRow(CHARACTER_WIDTH + 1 + narrow);
    const count = perRow + 1;
    const rows = buildMiniRows(count, 0, perRow);
    expect(rows).toHaveLength(2);

    const lines = renderRow(withSubagents(count), { infoWidth: narrow }).split('\n');
    const first = lines.findIndex((line) => line.includes(rows[0] ?? ''));
    const second = lines.findIndex((line) => line.trim() === (rows[1] ?? '').trim());

    expect(first).toBeGreaterThanOrEqual(0);
    // 間に空行が 1 行入る
    expect(second).toBe(first + 2);
    expect(lines[first + 1]?.trim()).toBe('');
  });

  it('体数が増えても省略しない', () => {
    const output = renderRow(withSubagents(9));
    expect(output.match(/[▛▜]{2}/g)?.length).toBe(9);
  });

  it('サブエージェントがいなければミニキャラクターの行を出さない', () => {
    expect(renderRow(withSubagents(0))).not.toContain(getMiniFrame(0));
  });

  it('待機中のセッションでも出す', () => {
    // 非同期サブエージェントは親がユーザーへ応答を返したあとも走り続ける
    expect(renderRow(withSubagents(2, 'waiting'))).toContain(miniLines(2)[0]);
  });

  it('終了済みのセッションでは出さない', () => {
    expect(renderRow(withSubagents(2, 'done'))).not.toContain(miniLines(2)[0]);
  });

  it('showSubagents が false なら出さない', () => {
    expect(renderRow(withSubagents(2), { showSubagents: false })).not.toContain(miniLines(2)[0]);
  });

  it('ミニキャラクターが付いても AA と情報カラムの並びは変わらない', () => {
    const head = (overrides: Partial<Agent>, props = {}) =>
      renderRow(overrides, props)
        .split('\n')
        .filter((line) => !/[▛▜]{2}/.test(line) || line.includes('█'));

    expect(head(withSubagents(2))).toEqual(head(withSubagents(0)));
    expect(head(withSubagents(2), { showPrompt: false })).toEqual(
      head(withSubagents(0), { showPrompt: false }),
    );
  });
});
