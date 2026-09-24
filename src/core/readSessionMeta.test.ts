import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '../types/agent.js';
import {
  clearSessionMetaCache,
  fsTranscriptSource,
  HEAD_BYTES,
  INITIAL_TAIL_BYTES,
  readSessionMeta,
  type TranscriptSource,
} from './readSessionMeta.js';

const HOME = '/Users/naoki';
const PATH = '/Users/naoki/.claude/projects/-Users-naoki-GitHub-app/session-1.jsonl';

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  sessionId: 'session-1',
  name: 'worker',
  cwd: '/Users/naoki/GitHub/app',
  kind: 'interactive',
  startedAt: 0,
  state: 'working',
  rawState: 'busy',
  pid: 1,
  id: undefined,
  meta: undefined,
  ...overrides,
});

const TRANSCRIPT = [
  JSON.stringify({ type: 'last-prompt', lastPrompt: 'テストを書いて' }),
  JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 100_000 } } }),
  '',
].join('\n');

const MODEL_LINE = `${JSON.stringify({
  type: 'attachment',
  attachment: { type: 'model', identity: { modelId: 'claude-opus-5[1m]' } },
})}\n`;

/**
 * ファイル全体を持つ読み取り実装。
 *
 * 増分読みは「同じファイルの続きを読む」前提なので、末尾だけを返すモックでは
 * 位置の扱いを検証できない。全体を持たせて `readRange` で切り出す。
 */
const source = (content = TRANSCRIPT, head = '') => {
  const body = Buffer.from(content, 'utf8');
  const full = head === '' ? body : Buffer.concat([Buffer.from(head, 'utf8'), body]);
  const stat = vi.fn(async () => ({ mtimeMs: 1, size: full.length }));
  const readRange = vi.fn(async (_path: string, start: number, bytes: number) =>
    full.subarray(start, start + Math.max(bytes, 0)),
  );
  return { stat, readRange } satisfies TranscriptSource;
};

beforeEach(clearSessionMetaCache);

describe('readSessionMeta', () => {
  it('transcript から付加情報を読む', async () => {
    const meta = await readSessionMeta(agent(), { home: HOME, source: source() });
    expect(meta?.lastPrompt).toBe('テストを書いて');
    expect(meta?.tokens?.used).toBe(100_000);
  });

  it('初回は末尾から読む', async () => {
    const fake = source();
    await readSessionMeta(agent(), { home: HOME, source: fake });
    expect(fake.readRange).toHaveBeenCalledWith(PATH, 0, Buffer.byteLength(TRANSCRIPT));
  });

  it('初回読みに収まるサイズなら先頭は読まない', async () => {
    const fake = source();
    await readSessionMeta(agent(), { home: HOME, source: fake });
    expect(fake.readRange).toHaveBeenCalledTimes(1);
  });

  it('初回読みに収まらないサイズなら先頭も読む', async () => {
    const padding = `${'{}'.padEnd(INITIAL_TAIL_BYTES, ' ')}\n`;
    const fake = source(padding + TRANSCRIPT, MODEL_LINE);
    await readSessionMeta(agent(), { home: HOME, source: fake });
    expect(fake.readRange).toHaveBeenCalledWith(PATH, 0, HEAD_BYTES);
  });

  it('先頭にあるモデル ID からコンテキスト上限を決める', async () => {
    const padding = `${'{}'.padEnd(INITIAL_TAIL_BYTES, ' ')}\n`;
    const fake = source(padding + TRANSCRIPT, MODEL_LINE);
    const meta = await readSessionMeta(agent(), { home: HOME, source: fake });
    expect(meta?.tokens?.limit).toBe(1_000_000);
    expect(meta?.tokens?.ratio).toBeCloseTo(0.1);
  });

  it('cwd が空なら読みに行かない', async () => {
    const fake = source();
    expect(await readSessionMeta(agent({ cwd: '' }), { home: HOME, source: fake })).toBeUndefined();
    expect(fake.stat).not.toHaveBeenCalled();
  });

  it('ファイルが無ければ undefined を返す', async () => {
    const fake: TranscriptSource = {
      stat: vi.fn(async () => {
        throw new Error('ENOENT');
      }),
      readRange: vi.fn(async () => Buffer.alloc(0)),
    };
    expect(await readSessionMeta(agent(), { home: HOME, source: fake })).toBeUndefined();
  });

  it('読み取りに失敗しても undefined を返す', async () => {
    const fake: TranscriptSource = {
      stat: vi.fn(async () => ({ mtimeMs: 1, size: 10 })),
      readRange: vi.fn(async () => {
        throw new Error('EACCES');
      }),
    };
    expect(await readSessionMeta(agent(), { home: HOME, source: fake })).toBeUndefined();
  });

  it('コンテキスト上限を明示指定できる', async () => {
    const meta = await readSessionMeta(agent(), {
      home: HOME,
      source: source(),
      contextLimit: 400_000,
    });
    expect(meta?.tokens?.ratio).toBe(0.25);
  });
});

/** 追記していけるモック。増分読みの検証に使う。 */
const growingSource = (initial = '') => {
  let full = Buffer.from(initial, 'utf8');
  let mtimeMs = 1;
  const stat = vi.fn(async () => ({ mtimeMs, size: full.length }));
  const readRange = vi.fn(async (_path: string, start: number, bytes: number) =>
    full.subarray(start, start + Math.max(bytes, 0)),
  );
  const append = (text: string | Buffer): void => {
    full = Buffer.concat([full, typeof text === 'string' ? Buffer.from(text, 'utf8') : text]);
    mtimeMs += 1;
  };
  const truncate = (text: string): void => {
    full = Buffer.from(text, 'utf8');
    mtimeMs += 1;
  };
  return { source: { stat, readRange } satisfies TranscriptSource, append, truncate, readRange };
};

describe('readSessionMeta の増分読み', () => {
  const spawn = (id: string) =>
    `${JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id, name: 'Agent', input: {} }] },
    })}\n`;

  const notification = (id: string) =>
    `${JSON.stringify({
      type: 'queue-operation',
      operation: 'enqueue',
      content: `<task-notification>\n<tool-use-id>${id}</tool-use-id>\n`,
    })}\n`;

  it('2 回目以降は前回の続きだけを読む', async () => {
    const fake = growingSource(TRANSCRIPT);
    await readSessionMeta(agent(), { home: HOME, source: fake.source });
    const consumed = Buffer.byteLength(TRANSCRIPT);

    fake.append(spawn('toolu_1'));
    await readSessionMeta(agent(), { home: HOME, source: fake.source });

    expect(fake.readRange).toHaveBeenLastCalledWith(PATH, consumed, spawn('toolu_1').length);
  });

  it('初回の窓から押し出されてもサブエージェントを保持し続ける', async () => {
    const fake = growingSource(spawn('toolu_1'));
    await readSessionMeta(agent(), { home: HOME, source: fake.source });

    // 起動行が末尾から遠ざかっても消えないことが、増分読みの要点
    fake.append(`${'{}'.padEnd(INITIAL_TAIL_BYTES * 2, ' ')}\n`);
    const meta = await readSessionMeta(agent(), { home: HOME, source: fake.source });

    expect(meta?.subagents.map((item) => item.toolUseId)).toEqual(['toolu_1']);
  });

  it('後から来た完了通知で実行中から外す', async () => {
    const fake = growingSource(spawn('toolu_1'));
    await readSessionMeta(agent(), { home: HOME, source: fake.source });

    fake.append(notification('toolu_1'));
    const meta = await readSessionMeta(agent(), { home: HOME, source: fake.source });

    expect(meta?.subagents).toEqual([]);
  });

  it('行の途中で終わる増分は次回へ持ち越す', async () => {
    const fake = growingSource(TRANSCRIPT);
    await readSessionMeta(agent(), { home: HOME, source: fake.source });

    // 日本語を含む行を途中で割って追記する。文字位置で切ると後半が壊れる
    const bytes = Buffer.from(
      `${JSON.stringify({ type: 'last-prompt', lastPrompt: '増分の途中' })}\n`,
      'utf8',
    );
    const half = Math.floor(bytes.length / 2);

    // 行が完結するまでは前の値のまま
    fake.append(bytes.subarray(0, half));
    expect((await readSessionMeta(agent(), { home: HOME, source: fake.source }))?.lastPrompt).toBe(
      'テストを書いて',
    );

    // 残りが届いて行が揃えば読める
    fake.append(bytes.subarray(half));
    expect((await readSessionMeta(agent(), { home: HOME, source: fake.source }))?.lastPrompt).toBe(
      '増分の途中',
    );
  });

  it('読んだ位置より縮んでいたら末尾から読み直す', async () => {
    const fake = growingSource(TRANSCRIPT + spawn('toolu_1'));
    await readSessionMeta(agent(), { home: HOME, source: fake.source });

    fake.truncate(`${JSON.stringify({ type: 'last-prompt', lastPrompt: '別物' })}\n`);
    const meta = await readSessionMeta(agent(), { home: HOME, source: fake.source });

    expect(meta?.subagents).toEqual([]);
    expect(meta?.lastPrompt).toBe('別物');
  });
});

describe('readSessionMeta のキャッシュ', () => {
  it('mtime と size が同じなら読み直さない', async () => {
    const fake = source();
    await readSessionMeta(agent(), { home: HOME, source: fake });
    await readSessionMeta(agent(), { home: HOME, source: fake });
    expect(fake.readRange).toHaveBeenCalledTimes(1);
  });

  it('更新されていれば読み直す', async () => {
    const fake = growingSource(TRANSCRIPT);
    await readSessionMeta(agent(), { home: HOME, source: fake.source });
    fake.append(`${JSON.stringify({ type: 'last-prompt', lastPrompt: '新しい' })}\n`);
    const meta = await readSessionMeta(agent(), { home: HOME, source: fake.source });

    expect(fake.readRange).toHaveBeenCalledTimes(2);
    expect(meta?.lastPrompt).toBe('新しい');
  });

  it('clearSessionMetaCache でキャッシュを捨てられる', async () => {
    const fake = source();
    await readSessionMeta(agent(), { home: HOME, source: fake });
    clearSessionMetaCache();
    await readSessionMeta(agent(), { home: HOME, source: fake });
    expect(fake.readRange).toHaveBeenCalledTimes(2);
  });
});

describe('fsTranscriptSource', () => {
  const dirs: string[] = [];

  const writeTemp = async (content: string): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), 'cc-park-'));
    dirs.push(dir);
    const path = join(dir, 'transcript.jsonl');
    await writeFile(path, content, 'utf8');
    return path;
  };

  afterAll(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('ファイルの mtime と size を返す', async () => {
    const path = await writeTemp('abc');
    const stats = await fsTranscriptSource.stat(path);
    expect(stats.size).toBe(3);
    expect(stats.mtimeMs).toBeGreaterThan(0);
  });

  it('指定した位置から指定したバイト数を読む', async () => {
    const path = await writeTemp('0123456789');
    expect((await fsTranscriptSource.readRange(path, 6, 4)).toString('utf8')).toBe('6789');
  });

  it('ファイル末尾を超える長さでも読める範囲だけ返す', async () => {
    const path = await writeTemp('hello');
    expect((await fsTranscriptSource.readRange(path, 0, HEAD_BYTES)).toString('utf8')).toBe('hello');
  });

  it('読む長さが 0 なら空を返す', async () => {
    const path = await writeTemp('hello');
    expect((await fsTranscriptSource.readRange(path, 5, 0)).length).toBe(0);
  });

  it('実ファイルから付加情報を読み取れる', async () => {
    const path = await writeTemp(TRANSCRIPT);
    // 組み立てられるパスは実在しないので、実ファイルへ読み替えて実装を通す
    const redirect: TranscriptSource = {
      stat: async () => fsTranscriptSource.stat(path),
      readRange: async (_path, start, bytes) => fsTranscriptSource.readRange(path, start, bytes),
    };

    expect((await readSessionMeta(agent(), { home: HOME, source: redirect }))?.lastPrompt).toBe(
      'テストを書いて',
    );

    // 追記したぶんだけを読み直せる
    await appendFile(path, `${JSON.stringify({ type: 'last-prompt', lastPrompt: '追記' })}\n`);
    expect((await readSessionMeta(agent(), { home: HOME, source: redirect }))?.lastPrompt).toBe(
      '追記',
    );
  });
});
