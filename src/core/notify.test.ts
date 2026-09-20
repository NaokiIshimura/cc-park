import { describe, expect, it, vi } from 'vitest';
import {
  buildNotifyScript,
  escapeAppleScriptString,
  execFileNotifyRunner,
  notify,
} from './notify.js';

describe('escapeAppleScriptString', () => {
  it('ダブルクォートをエスケープする', () => {
    expect(escapeAppleScriptString('say "hi"')).toBe('say \\"hi\\"');
  });

  it('バックスラッシュをエスケープする', () => {
    expect(escapeAppleScriptString('a\\b')).toBe('a\\\\b');
  });

  it('改行を空白へ潰す', () => {
    expect(escapeAppleScriptString('a\nb\r\nc')).toBe('a b c');
  });

  it('バックスラッシュを先にエスケープするため二重処理されない', () => {
    expect(escapeAppleScriptString('\\"')).toBe('\\\\\\"');
  });
});

describe('buildNotifyScript', () => {
  it('title と message からスクリプトを組み立てる', () => {
    expect(buildNotifyScript({ title: 'T', message: 'M' })).toBe(
      'display notification "M" with title "T"',
    );
  });

  it('subtitle を含められる', () => {
    expect(buildNotifyScript({ title: 'T', message: 'M', subtitle: 'S' })).toBe(
      'display notification "M" with title "T" subtitle "S"',
    );
  });

  it('subtitle が空文字なら含めない', () => {
    expect(buildNotifyScript({ title: 'T', message: 'M', subtitle: '' })).not.toContain('subtitle');
  });

  it('危険な文字を含む名前でも安全にエスケープされる', () => {
    const script = buildNotifyScript({ title: 'T', message: '"; do shell script "rm -rf /' });
    expect(script).toBe(
      'display notification "\\"; do shell script \\"rm -rf /" with title "T"',
    );
  });
});

describe('notify', () => {
  it('darwin では osascript を実行する', () => {
    const runner = vi.fn();
    expect(notify({ title: 'T', message: 'M' }, { platform: 'darwin', runner })).toBe(true);
    expect(runner).toHaveBeenCalledWith('osascript', [
      '-e',
      'display notification "M" with title "T"',
    ]);
  });

  it('platform 未指定なら実行環境の platform を使う', () => {
    const runner = vi.fn();
    const expected = process.platform === 'darwin';
    expect(notify({ title: 'T', message: 'M' }, { runner })).toBe(expected);
    expect(runner).toHaveBeenCalledTimes(expected ? 1 : 0);
  });

  it('darwin 以外では何もしない', () => {
    const runner = vi.fn();
    expect(notify({ title: 'T', message: 'M' }, { platform: 'linux', runner })).toBe(false);
    expect(runner).not.toHaveBeenCalled();
  });
});

describe('execFileNotifyRunner', () => {
  it('コマンド実行に失敗しても例外を投げない', () => {
    expect(() =>
      execFileNotifyRunner('cc-park-no-such-command', []),
    ).not.toThrow();
  });

  it('存在するコマンドを実行できる', () => {
    expect(() => execFileNotifyRunner('true', [])).not.toThrow();
  });
});
