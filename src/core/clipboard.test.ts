import { describe, expect, it, vi } from 'vitest';
import { buildResumeCommand, copyToClipboard, createCommandWriter } from './clipboard.js';

describe('buildResumeCommand', () => {
  it('claude --resume 形式の文字列を返す', () => {
    expect(buildResumeCommand('40e18e35')).toBe('claude --resume 40e18e35');
  });
});

describe('copyToClipboard', () => {
  it('darwin ではライターへテキストを渡す', () => {
    const writer = vi.fn();
    expect(copyToClipboard('hello', { platform: 'darwin', writer })).toBe(true);
    expect(writer).toHaveBeenCalledWith('hello');
  });

  it('platform 未指定なら実行環境の platform を使う', () => {
    const writer = vi.fn();
    const expected = process.platform === 'darwin';
    expect(copyToClipboard('hello', { writer })).toBe(expected);
    expect(writer).toHaveBeenCalledTimes(expected ? 1 : 0);
  });

  it('darwin 以外では何もしない', () => {
    const writer = vi.fn();
    expect(copyToClipboard('hello', { platform: 'win32', writer })).toBe(false);
    expect(writer).not.toHaveBeenCalled();
  });
});

describe('createCommandWriter', () => {
  it('コマンドの標準入力へ書き込める', () => {
    // 実際のクリップボードを汚さないよう cat で代用する
    expect(() => createCommandWriter('cat')('hello')).not.toThrow();
  });

  it('存在しないコマンドでも例外を投げない', () => {
    expect(() =>
      createCommandWriter('claude-code-watcher-no-such-command')('hello'),
    ).not.toThrow();
  });
});
