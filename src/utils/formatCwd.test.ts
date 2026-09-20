import { describe, expect, it } from 'vitest';
import { formatCwd } from './formatCwd.js';

const HOME = '/Users/naoki';

describe('formatCwd', () => {
  it('ホームディレクトリを ~ に短縮する', () => {
    expect(formatCwd('/Users/naoki/GitHub/app', 40, HOME)).toBe('~/GitHub/app');
  });

  it('ホームそのものは ~ になる', () => {
    expect(formatCwd(HOME, 40, HOME)).toBe('~');
  });

  it('ホーム配下でないパスはそのまま', () => {
    expect(formatCwd('/tmp/work', 40, HOME)).toBe('/tmp/work');
  });

  it('ホーム名を前方一致で誤爆しない', () => {
    expect(formatCwd('/Users/naokixyz/app', 40, HOME)).toBe('/Users/naokixyz/app');
  });

  it('空文字は - を返す', () => {
    expect(formatCwd('', 40, HOME)).toBe('-');
  });

  it('maxWidth を超える場合は先頭を中略する', () => {
    expect(formatCwd('/Users/naoki/a/b/c/d/e/f', 10, HOME)).toBe('…b/c/d/e/f');
  });

  it('中略後の長さは maxWidth を超えない', () => {
    expect(formatCwd('/Users/naoki/a/b/c/d/e/f', 10, HOME)).toHaveLength(10);
  });

  it('maxWidth 以下ならそのまま返す', () => {
    expect(formatCwd('/tmp', 4, HOME)).toBe('/tmp');
  });

  it('maxWidth が 1 以下なら中略しない', () => {
    expect(formatCwd('/tmp/work', 1, HOME)).toBe('/tmp/work');
  });

  it('home が空文字でも動作する', () => {
    expect(formatCwd('/Users/naoki/app', 40, '')).toBe('/Users/naoki/app');
  });

  it('既定の maxWidth は 40', () => {
    const long = `${HOME}/${'x'.repeat(60)}`;
    expect(formatCwd(long, undefined, HOME)).toHaveLength(40);
  });
});
