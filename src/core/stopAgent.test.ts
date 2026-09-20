import { describe, expect, it, vi } from 'vitest';
import type { CommandRunner } from './runCommand.js';
import { buildStopArgs, canStop, stopAgent, stopUnsupportedReason } from './stopAgent.js';
import type { Agent } from '../types/agent.js';

const background = (overrides: Partial<Agent> = {}): Agent => ({
  sessionId: '2160cf1c-ca33-4853-b345-fbc356688e1f',
  name: 'claude agents setup',
  cwd: '/Users/naoki',
  kind: 'background',
  startedAt: 1789881096899,
  state: 'blocked',
  rawState: 'blocked',
  pid: undefined,
  id: '2160cf1c',
  ...overrides,
});

const runnerReturning = (stdout = ''): CommandRunner => vi.fn(async () => stdout);
const runnerRejecting = (error: unknown): CommandRunner =>
  vi.fn(async () => {
    throw error;
  });

describe('canStop', () => {
  it('ID を持つ background は停止できる', () => {
    expect(canStop(background())).toBe(true);
  });

  it('interactive は停止できない', () => {
    expect(canStop(background({ kind: 'interactive', id: undefined, pid: 1 }))).toBe(false);
  });

  it('unknown は停止できない', () => {
    expect(canStop(background({ kind: 'unknown' }))).toBe(false);
  });

  it('ID が無い background は停止できない', () => {
    expect(canStop(background({ id: undefined }))).toBe(false);
  });

  it('ID が空文字の background は停止できない', () => {
    expect(canStop(background({ id: '' }))).toBe(false);
  });
});

describe('stopUnsupportedReason', () => {
  it('interactive には CLI 非対応である旨を返す', () => {
    expect(stopUnsupportedReason(background({ kind: 'interactive' }))).toContain('interactive');
  });

  it('ID 欠損の background には ID の問題を返す', () => {
    expect(stopUnsupportedReason(background({ id: undefined }))).toContain('ID');
  });
});

describe('buildStopArgs', () => {
  it('stop と ID を並べる', () => {
    expect(buildStopArgs('2160cf1c')).toEqual(['stop', '2160cf1c']);
  });
});

describe('stopAgent', () => {
  it('成功すると ok を返す', async () => {
    const result = await stopAgent(background(), { runner: runnerReturning() });
    expect(result).toEqual({ ok: true });
  });

  it('ランナーへコマンドと引数を渡す', async () => {
    const runner = runnerReturning();
    await stopAgent(background(), { runner, timeoutMs: 1234 });
    expect(runner).toHaveBeenCalledWith('claude', ['stop', '2160cf1c'], {
      timeoutMs: 1234,
      signal: undefined,
    });
  });

  it('command オプションで実行コマンドを差し替えられる', async () => {
    const runner = runnerReturning();
    await stopAgent(background(), { runner, command: '/usr/local/bin/claude' });
    expect(runner).toHaveBeenCalledWith(
      '/usr/local/bin/claude',
      expect.anything(),
      expect.anything(),
    );
  });

  it('signal をランナーへ渡す', async () => {
    const runner = runnerReturning();
    const controller = new AbortController();
    await stopAgent(background(), { runner, signal: controller.signal });
    expect(runner).toHaveBeenCalledWith(
      'claude',
      expect.anything(),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('停止できない相手にはコマンドを実行せず unsupported を返す', async () => {
    const runner = runnerReturning();
    const result = await stopAgent(background({ kind: 'interactive', id: undefined }), { runner });
    expect(runner).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unsupported');
    }
  });

  it('コマンドが見つからなければ not-found を返す', async () => {
    const error = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    const result = await stopAgent(background(), { runner: runnerRejecting(error) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not-found');
    }
  });

  it('タイムアウトを timeout として返す', async () => {
    const error = Object.assign(new Error('killed'), { killed: true });
    const result = await stopAgent(background(), { runner: runnerRejecting(error) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('timeout');
      expect(result.error.message).toContain('claude stop');
    }
  });

  it('中断は stop 向けの文言を返す', async () => {
    const error = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const result = await stopAgent(background(), { runner: runnerRejecting(error) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'aborted', message: 'stop を中断しました。' });
    }
  });

  it('その他の失敗は exit としてメッセージを保つ', async () => {
    const result = await stopAgent(background(), {
      runner: runnerRejecting(new Error('no such session')),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'exit', message: 'no such session' });
    }
  });

  it('既定ランナー経由でも claude コマンド未検出を Result で返す', async () => {
    const result = await stopAgent(background(), {
      command: 'claude-code-watcher-no-such-command',
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'not-found' } });
  });
});
