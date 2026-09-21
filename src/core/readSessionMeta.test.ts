import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '../types/agent.js';
import {
  clearSessionMetaCache,
  fsTranscriptSource,
  readSessionMeta,
  TAIL_BYTES,
  type TranscriptSource,
} from './readSessionMeta.js';

const HOME = '/Users/naoki';

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
].join('\n');

/** stat / readTail を数えられるモック。 */
const source = (chunk = TRANSCRIPT, stats = { mtimeMs: 1, size: 10 }) => {
  const readTail = vi.fn(async () => chunk);
  const stat = vi.fn(async () => stats);
  return { stat, readTail } satisfies TranscriptSource;
};

beforeEach(clearSessionMetaCache);

describe('readSessionMeta', () => {
  it('transcript の末尾から付加情報を読む', async () => {
    const meta = await readSessionMeta(agent(), { home: HOME, source: source() });
    expect(meta?.lastPrompt).toBe('テストを書いて');
    expect(meta?.tokens?.used).toBe(100_000);
  });

  it('末尾だけを読む', async () => {
    const fake = source();
    await readSessionMeta(agent(), { home: HOME, source: fake });
    expect(fake.readTail).toHaveBeenCalledWith(
      '/Users/naoki/.claude/projects/-Users-naoki-GitHub-app/session-1.jsonl',
      TAIL_BYTES,
    );
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
      readTail: vi.fn(async () => ''),
    };
    expect(await readSessionMeta(agent(), { home: HOME, source: fake })).toBeUndefined();
  });

  it('読み取りに失敗しても undefined を返す', async () => {
    const fake: TranscriptSource = {
      stat: vi.fn(async () => ({ mtimeMs: 1, size: 10 })),
      readTail: vi.fn(async () => {
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

describe('readSessionMeta のキャッシュ', () => {
  it('mtime と size が同じなら読み直さない', async () => {
    const fake = source();
    await readSessionMeta(agent(), { home: HOME, source: fake });
    await readSessionMeta(agent(), { home: HOME, source: fake });
    expect(fake.readTail).toHaveBeenCalledTimes(1);
  });

  it('更新されていれば読み直す', async () => {
    const chunk = JSON.stringify({ type: 'last-prompt', lastPrompt: '古い' });
    let stats = { mtimeMs: 1, size: 10 };
    const fake: TranscriptSource = {
      stat: vi.fn(async () => stats),
      readTail: vi.fn(async () => chunk),
    };

    await readSessionMeta(agent(), { home: HOME, source: fake });
    stats = { mtimeMs: 2, size: 20 };
    await readSessionMeta(agent(), { home: HOME, source: fake });

    expect(fake.readTail).toHaveBeenCalledTimes(2);
  });

  it('clearSessionMetaCache でキャッシュを捨てられる', async () => {
    const fake = source();
    await readSessionMeta(agent(), { home: HOME, source: fake });
    clearSessionMetaCache();
    await readSessionMeta(agent(), { home: HOME, source: fake });
    expect(fake.readTail).toHaveBeenCalledTimes(2);
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

  it('ファイル全体より大きいバイト数を指定しても全文を読む', async () => {
    const path = await writeTemp('hello');
    expect(await fsTranscriptSource.readTail(path, TAIL_BYTES)).toBe('hello');
  });

  it('指定したバイト数ぶんだけ末尾を読む', async () => {
    const path = await writeTemp('0123456789');
    expect(await fsTranscriptSource.readTail(path, 4)).toBe('6789');
  });

  it('実ファイルから付加情報を読み取れる', async () => {
    const path = await writeTemp(TRANSCRIPT);
    const meta = await readSessionMeta(agent(), {
      home: HOME,
      // 組み立てられるパスは実在しないので、実ファイルへ読み替えて実装を通す
      source: {
        stat: async () => fsTranscriptSource.stat(path),
        readTail: async (_path, bytes) => fsTranscriptSource.readTail(path, bytes),
      },
    });
    expect(meta?.lastPrompt).toBe('テストを書いて');
  });
});
