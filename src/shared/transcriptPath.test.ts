import { describe, expect, it } from 'vitest';
import { buildTranscriptPath, encodeProjectDir } from './transcriptPath.js';

describe('encodeProjectDir', () => {
  it('英数字以外をすべて - に置き換える', () => {
    expect(encodeProjectDir('/Users/naoki/GitHub/cc-park')).toBe('-Users-naoki-GitHub-cc-park');
  });

  it('ドットやアンダースコアも - になる', () => {
    expect(encodeProjectDir('/a/.claude/tmp_x')).toBe('-a--claude-tmp-x');
  });

  it('記号が連続しても 1 文字ずつ置き換える', () => {
    expect(encodeProjectDir('/tmp//a')).toBe('-tmp--a');
  });

  it('英数字だけならそのまま返す', () => {
    expect(encodeProjectDir('abc123')).toBe('abc123');
  });

  it('空文字は空文字のまま', () => {
    expect(encodeProjectDir('')).toBe('');
  });
});

describe('buildTranscriptPath', () => {
  it('home / cwd / sessionId から transcript のパスを組み立てる', () => {
    expect(buildTranscriptPath('/Users/naoki', '/Users/naoki/GitHub/app', 'abc')).toBe(
      '/Users/naoki/.claude/projects/-Users-naoki-GitHub-app/abc.jsonl',
    );
  });

  it('home が空なら特定できないので null', () => {
    expect(buildTranscriptPath('', '/tmp', 'abc')).toBeNull();
  });

  it('cwd が空なら特定できないので null', () => {
    expect(buildTranscriptPath('/Users/naoki', '', 'abc')).toBeNull();
  });

  it('sessionId が空なら特定できないので null', () => {
    expect(buildTranscriptPath('/Users/naoki', '/tmp', '')).toBeNull();
  });
});
