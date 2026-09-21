import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { Agent, AgentKind, CharacterState } from '../../types/agent.js';
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
    expect(withMeta({ lastPrompt: 'テストを書いて', tokens: undefined })).toContain(
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
    });
    expect(output).toContain('ctx  45%');
    expect(output).toContain('████░░░░');
  });

  it('トークン情報が無ければ ctx を出さない', () => {
    expect(renderRow()).not.toContain('ctx');
  });

  it('showPrompt が false ならプロンプト行を出さない', () => {
    const output = renderRow(
      { meta: { lastPrompt: 'やって', tokens: undefined } },
      { showPrompt: false },
    );
    expect(output).not.toContain('やって');
  });

  it('showTokens が false なら ctx を出さない', () => {
    const output = renderRow(
      { meta: { lastPrompt: undefined, tokens: { used: 1, limit: 200_000, ratio: 0.5 } } },
      { showTokens: false },
    );
    expect(output).not.toContain('ctx');
  });

  it('情報カラムが狭いときはトークンを省いて名前を優先する', () => {
    const output = renderRow(
      { meta: { lastPrompt: undefined, tokens: { used: 1, limit: 200_000, ratio: 0.5 } } },
      { infoWidth: 20 },
    );
    expect(output).not.toContain('ctx');
    expect(output).toContain('cc-park');
  });

  it('showPrompt が有効なら 3 行になり 名前・状態・プロンプトの順に並ぶ', () => {
    const lines = withMeta({ lastPrompt: 'やって', tokens: undefined }).split('\n');
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
