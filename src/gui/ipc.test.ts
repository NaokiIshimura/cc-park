import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from './ipc.js';

describe('IPC_CHANNELS', () => {
  it('チャンネル名が重複していない', () => {
    const names = Object.values(IPC_CHANNELS);
    expect(new Set(names).size).toBe(names.length);
  });

  it('用途が分かる名前空間付きの名前になっている', () => {
    for (const name of Object.values(IPC_CHANNELS)) {
      expect(name).toMatch(/^[a-z]+:[a-zA-Z]+$/);
    }
  });
});
