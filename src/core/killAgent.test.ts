import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '../types/agent.js';
import {
  DEFAULT_KILL_SIGNAL,
  canKill,
  killAgent,
  killUnsupportedReason,
  toKillError,
} from './killAgent.js';

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  sessionId: 'int-1',
  name: 'naoki-16',
  cwd: '/Users/naoki',
  kind: 'interactive',
  startedAt: 0,
  state: 'waiting',
  rawState: 'idle',
  pid: 71547,
  id: undefined,
  meta: undefined,
  ...overrides,
});

const errnoError = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`kill ${code}`), { code });

describe('canKill', () => {
  it('PID を持つ interactive セッションは対象', () => {
    expect(canKill(agent())).toBe(true);
  });

  it('PID が無ければ対象外', () => {
    expect(canKill(agent({ pid: undefined }))).toBe(false);
  });

  it('PID が 0 以下なら対象外', () => {
    expect(canKill(agent({ pid: 0 }))).toBe(false);
    expect(canKill(agent({ pid: -1 }))).toBe(false);
  });

  it('background セッションは対象外', () => {
    expect(canKill(agent({ kind: 'background', pid: undefined, id: 'bg-1' }))).toBe(false);
  });
});

describe('killUnsupportedReason', () => {
  it('interactive では PID が取れなかったことを伝える', () => {
    expect(killUnsupportedReason(agent({ pid: undefined }))).toContain('PID');
  });

  it('background では stop を案内する', () => {
    expect(killUnsupportedReason(agent({ kind: 'background' }))).toContain('stop');
  });
});

describe('toKillError', () => {
  it('ESRCH はプロセス不在として扱う', () => {
    expect(toKillError(errnoError('ESRCH'))).toMatchObject({ kind: 'not-found' });
  });

  it('EPERM は権限不足として扱う', () => {
    expect(toKillError(errnoError('EPERM'))).toMatchObject({ kind: 'permission' });
  });

  it('その他はメッセージをそのまま伝える', () => {
    expect(toKillError(new Error('boom'))).toEqual({ kind: 'failed', message: 'boom' });
  });

  it('Error でない値も文字列化して扱う', () => {
    expect(toKillError('壊れた')).toEqual({ kind: 'failed', message: '壊れた' });
  });
});

describe('killAgent', () => {
  it('既定では SIGTERM を送る', async () => {
    const sender = vi.fn();
    await expect(killAgent(agent(), { sender })).resolves.toEqual({ ok: true });
    expect(sender).toHaveBeenCalledWith(71547, DEFAULT_KILL_SIGNAL);
  });

  it('シグナルを指定できる', async () => {
    const sender = vi.fn();
    await killAgent(agent(), { sender, signal: 'SIGKILL' });
    expect(sender).toHaveBeenCalledWith(71547, 'SIGKILL');
  });

  it('対象外のセッションは実行前に弾く', async () => {
    const sender = vi.fn();
    const result = await killAgent(agent({ pid: undefined }), { sender });

    expect(result).toMatchObject({ ok: false, error: { kind: 'unsupported' } });
    expect(sender).not.toHaveBeenCalled();
  });

  it('送出に失敗しても例外にせず Result で返す', async () => {
    const sender = vi.fn(() => {
      throw errnoError('ESRCH');
    });
    await expect(killAgent(agent(), { sender })).resolves.toMatchObject({
      ok: false,
      error: { kind: 'not-found' },
    });
  });

  it('既定の送出手段は process.kill を使う', async () => {
    const spy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      await expect(killAgent(agent())).resolves.toEqual({ ok: true });
      expect(spy).toHaveBeenCalledWith(71547, DEFAULT_KILL_SIGNAL);
    } finally {
      spy.mockRestore();
    }
  });
});
