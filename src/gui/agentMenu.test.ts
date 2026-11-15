import { describe, expect, it } from 'vitest';
import { agentMenuItems, toAgentMenuRequest } from './agentMenu.js';

describe('agentMenuItems', () => {
  it('開く・コピー・stop・kill を、キー操作と同じ順に並べる', () => {
    const items = agentMenuItems({ sessionId: 's1', canStop: true, canKill: true });
    expect(items.map(({ action, label, accelerator }) => [action, label, accelerator])).toEqual([
      ['open', '開く', 'Enter'],
      ['copy', '開くコマンドをコピー', 'C'],
      ['stop', 'stop…', 'S'],
      ['kill', 'kill…', 'X'],
    ]);
  });

  it('stop の前で区切る', () => {
    const items = agentMenuItems({ sessionId: 's1', canStop: true, canKill: true });
    expect(items.filter((item) => item.separatorBefore).map((item) => item.action)).toEqual([
      'stop',
    ]);
  });

  it('対象にできない stop / kill は無効にする（項目は残す）', () => {
    const items = agentMenuItems({ sessionId: 's1', canStop: false, canKill: true });
    expect(Object.fromEntries(items.map((item) => [item.action, item.enabled]))).toEqual({
      open: true,
      copy: true,
      stop: false,
      kill: true,
    });
  });
});

describe('toAgentMenuRequest', () => {
  it('renderer から届いた値を解釈する', () => {
    expect(toAgentMenuRequest({ sessionId: 's1', canStop: true, canKill: false })).toEqual({
      sessionId: 's1',
      canStop: true,
      canKill: false,
    });
  });

  it('真偽値でなければ「できない」に倒す', () => {
    expect(toAgentMenuRequest({ sessionId: 's1', canStop: 'yes' })).toEqual({
      sessionId: 's1',
      canStop: false,
      canKill: false,
    });
  });

  it('セッション ID が無ければ null', () => {
    expect(toAgentMenuRequest({ canStop: true })).toBeNull();
    expect(toAgentMenuRequest({ sessionId: '' })).toBeNull();
    expect(toAgentMenuRequest(null)).toBeNull();
  });
});
