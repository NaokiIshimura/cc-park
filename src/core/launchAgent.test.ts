import { describe, expect, it, vi } from 'vitest';
import { buildLaunchArgs, launchAgent, parseLaunchedId } from './launchAgent.js';
import type { CommandRunner } from './runCommand.js';

const target = { cwd: '/Users/naoki/GitHub/cc-park', prompt: '今日の TODO を整理して' };

const runnerReturning = (stdout = '2160cf1c\n'): CommandRunner => vi.fn(async () => stdout);
const runnerRejecting = (error: unknown): CommandRunner =>
  vi.fn(async () => {
    throw error;
  });

const exists = () => true;

describe('buildLaunchArgs', () => {
  it('--bg とプロンプトを並べる', () => {
    expect(buildLaunchArgs('掃除して')).toEqual(['--bg', '掃除して']);
  });

  it('シェルの記号を含むプロンプトもそのまま渡す', () => {
    // execFile なのでシェルを経由しない。引用符で囲んだりエスケープしたりしない
    expect(buildLaunchArgs('$(rm -rf /) を説明して')).toEqual([
      '--bg',
      '$(rm -rf /) を説明して',
    ]);
  });
});

describe('parseLaunchedId', () => {
  it('末尾の行を ID として取り出す', () => {
    expect(parseLaunchedId('Starting...\n2160cf1c\n')).toBe('2160cf1c');
  });

  it('空の出力では空文字を返す', () => {
    expect(parseLaunchedId('\n  \n')).toBe('');
  });
});

describe('launchAgent', () => {
  it('成功すると ID を返す', async () => {
    const result = await launchAgent(target, { runner: runnerReturning(), exists });
    expect(result).toEqual({ ok: true, id: '2160cf1c' });
  });

  it('予約のディレクトリでコマンドを実行する', async () => {
    const runner = runnerReturning();
    await launchAgent(target, { runner, exists, timeoutMs: 1234 });
    expect(runner).toHaveBeenCalledWith('claude', ['--bg', '今日の TODO を整理して'], {
      timeoutMs: 1234,
      signal: undefined,
      cwd: '/Users/naoki/GitHub/cc-park',
    });
  });

  it('command オプションで実行コマンドを差し替えられる', async () => {
    const runner = runnerReturning();
    await launchAgent(target, { runner, exists, command: '/usr/local/bin/claude' });
    expect(runner).toHaveBeenCalledWith(
      '/usr/local/bin/claude',
      expect.anything(),
      expect.anything(),
    );
  });

  it('ディレクトリが無ければ実行せず missing-cwd を返す', async () => {
    const runner = runnerReturning();
    const result = await launchAgent(target, { runner, exists: () => false });
    expect(runner).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('missing-cwd');
      expect(result.error.message).toContain('/Users/naoki/GitHub/cc-park');
    }
  });

  it('コマンドが見つからなければ not-found を返す', async () => {
    const error = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    const result = await launchAgent(target, { runner: runnerRejecting(error), exists });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not-found');
    }
  });

  it('タイムアウトを timeout として返す', async () => {
    const error = Object.assign(new Error('killed'), { killed: true });
    const result = await launchAgent(target, { runner: runnerRejecting(error), exists });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('timeout');
      expect(result.error.message).toContain('claude --bg');
    }
  });

  it('その他の失敗は exit としてメッセージを保つ', async () => {
    const result = await launchAgent(target, {
      runner: runnerRejecting(new Error('not logged in')),
      exists,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'exit', message: 'not logged in' });
    }
  });

  it('既定の実在確認でも存在しないディレクトリを弾く', async () => {
    const result = await launchAgent({ cwd: '/no/such/directory', prompt: 'p' });
    expect(result).toMatchObject({ ok: false, error: { kind: 'missing-cwd' } });
  });

  it('既定ランナー経由でも claude コマンド未検出を Result で返す', async () => {
    const result = await launchAgent(
      { cwd: '/tmp', prompt: 'p' },
      { command: 'cc-park-no-such-command' },
    );
    expect(result).toMatchObject({ ok: false, error: { kind: 'not-found' } });
  });
});
