import { describe, expect, it } from 'vitest';
import { parseTranscript, toSingleLine } from './parseTranscript.js';

const line = (value: unknown): string => JSON.stringify(value);

const lastPrompt = (text: string) => ({ type: 'last-prompt', lastPrompt: text });
const assistant = (usage: unknown) => ({ type: 'assistant', message: { usage } });
const modelAttachment = (modelId: unknown) => ({
  type: 'attachment',
  attachment: { type: 'model', identity: { modelId } },
});

describe('toSingleLine', () => {
  it('改行やタブを空白へ潰す', () => {
    expect(toSingleLine('a\nb\tc')).toBe('a b c');
  });

  it('連続する空白をまとめて前後を削る', () => {
    expect(toSingleLine('  a   b  ')).toBe('a b');
  });
});

describe('parseTranscript', () => {
  it('last-prompt から最終プロンプトを取り出す', () => {
    const meta = parseTranscript(line(lastPrompt('テストを書いて')));
    expect(meta.lastPrompt).toBe('テストを書いて');
  });

  it('last-prompt が複数あれば最後のものを使う', () => {
    const meta = parseTranscript([line(lastPrompt('古い')), line(lastPrompt('新しい'))].join('\n'));
    expect(meta.lastPrompt).toBe('新しい');
  });

  it('プロンプトの改行は空白へ潰す', () => {
    expect(parseTranscript(line(lastPrompt('a\nb'))).lastPrompt).toBe('a b');
  });

  it('空のプロンプトは無視する', () => {
    expect(parseTranscript(line(lastPrompt(''))).lastPrompt).toBeUndefined();
  });

  it('assistant の usage からトークン使用量を取り出す', () => {
    const meta = parseTranscript(
      line(assistant({ input_tokens: 2, cache_read_input_tokens: 99_998 })),
    );
    expect(meta.tokens).toEqual({ used: 100_000, limit: 200_000, ratio: 0.5 });
  });

  it('usage が複数あれば最後のものを使う', () => {
    const meta = parseTranscript(
      [line(assistant({ input_tokens: 10 })), line(assistant({ input_tokens: 20 }))].join('\n'),
    );
    expect(meta.tokens?.used).toBe(20);
  });

  it('コンテキスト上限を明示指定できる', () => {
    const meta = parseTranscript(line(assistant({ input_tokens: 50_000 })), {
      contextLimit: 100_000,
    });
    expect(meta.tokens?.ratio).toBe(0.5);
  });

  it('壊れた JSON 行は読み飛ばす', () => {
    const meta = parseTranscript(['{"type":"assis', line(lastPrompt('やって'))].join('\n'));
    expect(meta.lastPrompt).toBe('やって');
  });

  it('関係のない行は無視する', () => {
    const meta = parseTranscript(
      [line({ type: 'user', message: {} }), line({ type: 'mode', mode: 'normal' })].join('\n'),
    );
    expect(meta).toEqual({ lastPrompt: undefined, tokens: undefined });
  });

  it('usage を持たない assistant 行は無視する', () => {
    expect(parseTranscript(line({ type: 'assistant', message: {} })).tokens).toBeUndefined();
  });

  it('JSON が object でない行は無視する', () => {
    expect(parseTranscript(['123', '"text"', 'null'].join('\n')).lastPrompt).toBeUndefined();
  });

  it('空入力でも壊れない', () => {
    expect(parseTranscript('')).toEqual({ lastPrompt: undefined, tokens: undefined });
  });
});

describe('parseTranscript のモデル ID', () => {
  it('attachment からコンテキスト上限を決める', () => {
    const chunk = [
      line(modelAttachment('claude-opus-5[1m]')),
      line(assistant({ input_tokens: 159_645 })),
    ].join('\n');
    expect(parseTranscript(chunk).tokens?.limit).toBe(1_000_000);
  });

  it('attachment が無ければ使用量からの推定に戻る', () => {
    const chunk = line(assistant({ input_tokens: 159_645 }));
    expect(parseTranscript(chunk).tokens?.limit).toBe(200_000);
  });

  it('後から現れたモデル ID で上書きする', () => {
    const chunk = [
      line(modelAttachment('claude-opus-5[1m]')),
      line(modelAttachment('claude-opus-5')),
      line(assistant({ input_tokens: 159_645 })),
    ].join('\n');
    expect(parseTranscript(chunk).tokens?.limit).toBe(200_000);
  });

  it('文字列の中身として現れるだけの行は拾わない', () => {
    const echoed = line({
      type: 'user',
      message: { content: line(modelAttachment('claude-opus-5[1m]')) },
    });
    const chunk = [echoed, line(assistant({ input_tokens: 159_645 }))].join('\n');
    expect(parseTranscript(chunk).tokens?.limit).toBe(200_000);
  });

  it('modelId が文字列でなければ無視する', () => {
    const chunk = [
      line(modelAttachment(42)),
      line(assistant({ input_tokens: 159_645 })),
    ].join('\n');
    expect(parseTranscript(chunk).tokens?.limit).toBe(200_000);
  });

  it('明示指定はモデル ID より優先する', () => {
    const chunk = [
      line(modelAttachment('claude-opus-5[1m]')),
      line(assistant({ input_tokens: 100_000 })),
    ].join('\n');
    expect(parseTranscript(chunk, { contextLimit: 400_000 }).tokens?.limit).toBe(400_000);
  });
});
