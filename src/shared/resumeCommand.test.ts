import { describe, expect, it } from 'vitest';
import type { Agent } from '../types/agent.js';
import { buildResumeCommand } from './resumeCommand.js';

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  sessionId: '40e18e35-1c0f-4d0e-9f0f-2b2a0a8f0a11',
  name: 'cc-park',
  cwd: '/Users/naoki/GitHub/cc-park',
  kind: 'interactive',
  startedAt: 0,
  state: 'waiting',
  rawState: 'idle',
  pid: 1234,
  id: undefined,
  meta: undefined,
  ...overrides,
});

describe('buildResumeCommand', () => {
  it('interactive セッションは cd と claude --resume を繋げる', () => {
    expect(buildResumeCommand(agent())).toBe(
      'cd /Users/naoki/GitHub/cc-park && claude --resume 40e18e35-1c0f-4d0e-9f0f-2b2a0a8f0a11',
    );
  });

  it('background セッションは短縮 ID の claude attach にする', () => {
    expect(buildResumeCommand(agent({ kind: 'background', pid: undefined, id: 'fdf4892c' }))).toBe(
      'cd /Users/naoki/GitHub/cc-park && claude attach fdf4892c',
    );
  });

  it('background でも短縮 ID が無ければ claude --resume に落とす', () => {
    expect(
      buildResumeCommand(agent({ kind: 'background', pid: undefined, id: '', sessionId: 'a' })),
    ).toBe('cd /Users/naoki/GitHub/cc-park && claude --resume a');
  });

  it('作業ディレクトリが空なら claude コマンドだけを返す', () => {
    expect(buildResumeCommand(agent({ cwd: '', sessionId: 'a' }))).toBe('claude --resume a');
  });

  it('シェルで解釈が変わるパスは引用符で囲む', () => {
    expect(buildResumeCommand(agent({ cwd: "/tmp/my project's", sessionId: 'a' }))).toBe(
      `cd '/tmp/my project'\\''s' && claude --resume a`,
    );
  });
});
