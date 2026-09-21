import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '../types/agent.js';
import type { ReadSessionMetaOptions } from './readSessionMeta.js';
import { buildArgs, fetchAgents, type CommandRunner } from './fetchAgents.js';

const jsonFixture = JSON.stringify([
  {
    pid: 16460,
    cwd: '/Users/naoki',
    kind: 'interactive',
    startedAt: 1789918159032,
    sessionId: '40e18e35',
    name: 'cc-park',
    status: 'busy',
  },
]);

const runnerReturning = (stdout: string): CommandRunner => vi.fn(async () => stdout);
const runnerRejecting = (error: unknown): CommandRunner =>
  vi.fn(async () => {
    throw error;
  });

describe('buildArgs', () => {
  it('既定では agents --json のみ', () => {
    expect(buildArgs({})).toEqual(['agents', '--json']);
  });

  it('all 指定で --all を付ける', () => {
    expect(buildArgs({ all: true })).toEqual(['agents', '--json', '--all']);
  });

  it('all が false なら --all を付けない', () => {
    expect(buildArgs({ all: false })).toEqual(['agents', '--json']);
  });

  it('cwd 指定で --cwd を付ける', () => {
    expect(buildArgs({ cwd: '/tmp' })).toEqual(['agents', '--json', '--cwd', '/tmp']);
  });

  it('cwd が空文字なら付けない', () => {
    expect(buildArgs({ cwd: '' })).toEqual(['agents', '--json']);
  });

  it('all と cwd を同時に指定できる', () => {
    expect(buildArgs({ all: true, cwd: '/tmp' })).toEqual([
      'agents',
      '--json',
      '--all',
      '--cwd',
      '/tmp',
    ]);
  });
});

describe('fetchAgents', () => {
  it('正常な JSON を正規化して返す', async () => {
    const result = await fetchAgents({ runner: runnerReturning(jsonFixture) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]?.state).toBe('working');
    }
  });

  it('ランナーへコマンドと引数を渡す', async () => {
    const runner = runnerReturning('[]');
    await fetchAgents({ runner, all: true, timeoutMs: 1234 });
    expect(runner).toHaveBeenCalledWith(
      'claude',
      ['agents', '--json', '--all'],
      { timeoutMs: 1234, signal: undefined },
    );
  });

  it('command オプションで実行コマンドを差し替えられる', async () => {
    const runner = runnerReturning('[]');
    await fetchAgents({ runner, command: '/usr/local/bin/claude' });
    expect(runner).toHaveBeenCalledWith(
      '/usr/local/bin/claude',
      expect.anything(),
      expect.anything(),
    );
  });

  it('不正な JSON は parse エラーを返す', async () => {
    const result = await fetchAgents({ runner: runnerReturning('not json') });
    expect(result).toMatchObject({ ok: false, error: { kind: 'parse' } });
  });

  it('配列でない JSON は parse エラーを返す', async () => {
    const result = await fetchAgents({ runner: runnerReturning('{"a":1}') });
    expect(result).toMatchObject({ ok: false, error: { kind: 'parse' } });
  });

  it('ENOENT は not-found エラーを返す', async () => {
    const error = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    const result = await fetchAgents({ runner: runnerRejecting(error) });
    expect(result).toMatchObject({ ok: false, error: { kind: 'not-found' } });
  });

  it('タイムアウト（killed）は timeout エラーを返す', async () => {
    const error = Object.assign(new Error('timeout'), { killed: true });
    const result = await fetchAgents({ runner: runnerRejecting(error) });
    expect(result).toMatchObject({ ok: false, error: { kind: 'timeout' } });
  });

  it('SIGTERM も timeout エラーとして扱う', async () => {
    const error = Object.assign(new Error('killed'), { signal: 'SIGTERM' });
    const result = await fetchAgents({ runner: runnerRejecting(error) });
    expect(result).toMatchObject({ ok: false, error: { kind: 'timeout' } });
  });

  it('AbortError は aborted エラーを返す', async () => {
    const error = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const result = await fetchAgents({ runner: runnerRejecting(error) });
    expect(result).toMatchObject({ ok: false, error: { kind: 'aborted' } });
  });

  it('その他の失敗は exit エラーを返す', async () => {
    const result = await fetchAgents({ runner: runnerRejecting(new Error('exit 1')) });
    expect(result).toMatchObject({ ok: false, error: { kind: 'exit', message: 'exit 1' } });
  });

  it('Error 以外が投げられても文字列化して返す', async () => {
    const result = await fetchAgents({ runner: runnerRejecting('壊れた') });
    expect(result).toMatchObject({ ok: false, error: { kind: 'exit' } });
  });
});

// execFileRunner 自体の検証は runCommand.test.ts 側で行う
describe('既定ランナー', () => {
  it('既定ランナー経由でも claude コマンド未検出を Result で返す', async () => {
    const result = await fetchAgents({ command: 'cc-park-no-such-command' });
    expect(result).toMatchObject({ ok: false, error: { kind: 'not-found' } });
  });
});

describe('transcript 由来の付加情報', () => {
  const raw = [
    { kind: 'interactive', sessionId: 'a', name: 'alpha', cwd: '/tmp/x', status: 'busy' },
    { kind: 'interactive', sessionId: 'b', name: 'beta', cwd: '/tmp/y', status: 'idle' },
  ];
  const runner = runnerReturning(JSON.stringify(raw));

  it('既定では transcript を読まない', async () => {
    const metaReader = vi.fn(async () => ({ lastPrompt: 'x', tokens: undefined }));
    const result = await fetchAgents({ runner, metaReader });

    expect(metaReader).not.toHaveBeenCalled();
    expect(result.ok && result.agents[0]?.meta).toBeUndefined();
  });

  it('meta を有効にすると全セッションぶん合成する', async () => {
    const metaReader = vi.fn(async (agent: Agent) => ({
      lastPrompt: `prompt-${agent.sessionId}`,
      tokens: undefined,
    }));
    const result = await fetchAgents({ runner, meta: true, metaReader });

    expect(metaReader).toHaveBeenCalledTimes(2);
    expect(result.ok && result.agents.map((item) => item.meta?.lastPrompt)).toEqual([
      'prompt-a',
      'prompt-b',
    ]);
  });

  it('home と contextLimit を読み取りへ渡す', async () => {
    const metaReader = vi.fn(async (_agent: Agent, _options: ReadSessionMetaOptions) => undefined);
    await fetchAgents({
      runner,
      meta: true,
      metaReader,
      home: '/Users/naoki',
      contextLimit: 200_000,
    });

    expect(metaReader.mock.calls[0]?.[1]).toEqual({
      home: '/Users/naoki',
      contextLimit: 200_000,
    });
  });

  it('home 未指定なら既定の解決に任せる', async () => {
    const metaReader = vi.fn(async (_agent: Agent, _options: ReadSessionMetaOptions) => undefined);
    await fetchAgents({ runner, meta: true, metaReader });

    expect(metaReader.mock.calls[0]?.[1]).toEqual({ contextLimit: undefined });
  });

  it('metaReader 未指定なら既定の読み取りを使う', async () => {
    // 実在しない cwd なので transcript は見つからず、meta は undefined のまま返る
    const missing = runnerReturning(
      JSON.stringify([
        { kind: 'interactive', sessionId: 'z', name: 'zeta', cwd: '/no/such/dir', status: 'idle' },
      ]),
    );
    const result = await fetchAgents({ runner: missing, meta: true });

    expect(result.ok && result.agents).toHaveLength(1);
    expect(result.ok && result.agents[0]?.meta).toBeUndefined();
  });

  it('読み取りに失敗しても一覧は返る', async () => {
    const metaReader = vi.fn(async () => undefined);
    const result = await fetchAgents({ runner, meta: true, metaReader });

    expect(result.ok && result.agents).toHaveLength(2);
    expect(result.ok && result.agents[0]?.meta).toBeUndefined();
  });
});
