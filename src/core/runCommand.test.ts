import { describe, expect, it } from 'vitest';
import { execFileRunner, toCommandError } from './runCommand.js';

const TIMEOUT_MESSAGE = 'タイムアウトしました。';

describe('toCommandError', () => {
  it('ENOENT を not-found にする', () => {
    const error = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    expect(toCommandError(error, TIMEOUT_MESSAGE)).toEqual({
      kind: 'not-found',
      message: 'claude コマンドが見つかりません。PATH を確認してください。',
    });
  });

  it('AbortError を aborted にする', () => {
    const error = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(toCommandError(error, TIMEOUT_MESSAGE).kind).toBe('aborted');
  });

  it('killed を timeout にし、渡した文言を使う', () => {
    const error = Object.assign(new Error('killed'), { killed: true });
    expect(toCommandError(error, TIMEOUT_MESSAGE)).toEqual({
      kind: 'timeout',
      message: TIMEOUT_MESSAGE,
    });
  });

  it('SIGTERM を timeout にする', () => {
    const error = Object.assign(new Error('terminated'), { signal: 'SIGTERM' });
    expect(toCommandError(error, TIMEOUT_MESSAGE).kind).toBe('timeout');
  });

  it('それ以外は exit にしてメッセージを保つ', () => {
    expect(toCommandError(new Error('boom'), TIMEOUT_MESSAGE)).toEqual({
      kind: 'exit',
      message: 'boom',
    });
  });

  it('Error 以外でも文字列化して扱う', () => {
    expect(toCommandError('plain failure', TIMEOUT_MESSAGE)).toEqual({
      kind: 'exit',
      message: 'plain failure',
    });
  });

  it('null でも落ちない', () => {
    expect(toCommandError(null, TIMEOUT_MESSAGE)).toEqual({ kind: 'exit', message: 'null' });
  });
});

describe('execFileRunner', () => {
  it('標準出力を返す', async () => {
    const stdout = await execFileRunner('echo', ['hello'], {
      timeoutMs: 5000,
      signal: undefined,
    });
    expect(stdout.trim()).toBe('hello');
  });

  it('存在しないコマンドでは reject する', async () => {
    await expect(
      execFileRunner('claude-code-watcher-no-such-command', [], {
        timeoutMs: 5000,
        signal: undefined,
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('signal で中断できる', async () => {
    const controller = new AbortController();
    const promise = execFileRunner('sleep', ['5'], {
      timeoutMs: 5000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toBeDefined();
  });
});
