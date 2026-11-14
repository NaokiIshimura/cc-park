import { describe, expect, it } from 'vitest';
import type { CharacterState, SessionMeta } from '../types/agent.js';
import { getAppearance } from './characters.js';
import { blockedReason, formatPendingTool, statusDetail } from './statusDetail.js';

const meta = (pendingTool: SessionMeta['pendingTool']): SessionMeta => ({
  lastPrompt: undefined,
  tokens: undefined,
  subagents: [],
  pendingTool,
});

const agent = (state: CharacterState, overrides: { rawState?: string; meta?: SessionMeta } = {}) => ({
  state,
  rawState: overrides.rawState ?? '',
  meta: overrides.meta,
});

describe('formatPendingTool', () => {
  it('ツール名と主な引数を並べる', () => {
    expect(formatPendingTool({ name: 'Bash', detail: 'npm test' })).toBe('Bash: npm test');
  });

  it('引数が無ければツール名だけ', () => {
    expect(formatPendingTool({ name: 'ExitPlanMode', detail: '' })).toBe('ExitPlanMode');
  });
});

describe('statusDetail / blockedReason', () => {
  const bash = meta({ name: 'Bash', detail: 'rm -rf dist' });

  it('BLOCKED で対象が分かればそれを出す', () => {
    expect(statusDetail(agent('blocked', { meta: bash }))).toBe('Bash: rm -rf dist');
    expect(blockedReason(agent('blocked', { meta: bash }))).toBe('Bash: rm -rf dist');
  });

  it('BLOCKED でも対象が分からなければ状態の説明を出す', () => {
    expect(statusDetail(agent('blocked'))).toBe(getAppearance('blocked').description);
    expect(statusDetail(agent('blocked', { meta: meta(undefined) }))).toBe(
      getAppearance('blocked').description,
    );
    expect(blockedReason(agent('blocked'))).toBeUndefined();
  });

  it('BLOCKED 以外では未完了のツールがあっても出さない', () => {
    expect(statusDetail(agent('working', { meta: bash }))).toBe(
      getAppearance('working').description,
    );
    expect(blockedReason(agent('working', { meta: bash }))).toBeUndefined();
  });

  it('未知の状態は生の値を添える', () => {
    expect(statusDetail(agent('unknown', { rawState: 'paused' }))).toBe(
      `${getAppearance('unknown').description} (paused)`,
    );
  });
});
