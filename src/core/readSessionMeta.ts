import { open, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { parseTranscript } from '../shared/parseTranscript.js';
import { buildTranscriptPath } from '../shared/transcriptPath.js';
import type { Agent, SessionMeta } from '../types/agent.js';

/**
 * セッション transcript から最終プロンプトとトークン使用量を読む。
 *
 * transcript は数 MB に達するので、毎回の全読みは避けて末尾だけを切り出す。
 * 末尾 64KB あれば `last-prompt` と直近の `usage` の双方が入ることを実測で確認した。
 * 読めない・見つからない場合は例外を投げず undefined を返し、一覧表示を止めない。
 */

/** 末尾から読み取るバイト数。 */
export const TAIL_BYTES = 64 * 1024;

/** ファイルの状態。更新の有無をこれで判断する。 */
export interface TranscriptStat {
  readonly mtimeMs: number;
  readonly size: number;
}

/** 読み取りの実装。テストから差し替えられるよう切り出す。 */
export interface TranscriptSource {
  readonly stat: (path: string) => Promise<TranscriptStat>;
  /** 末尾 `bytes` ぶんを UTF-8 文字列として読む */
  readonly readTail: (path: string, bytes: number) => Promise<string>;
}

export const fsTranscriptSource: TranscriptSource = {
  stat: async (path) => {
    const stats = await stat(path);
    return { mtimeMs: stats.mtimeMs, size: stats.size };
  },
  readTail: async (path, bytes) => {
    const handle = await open(path, 'r');
    try {
      const { size } = await handle.stat();
      const start = Math.max(size - bytes, 0);
      const buffer = Buffer.alloc(size - start);
      await handle.read(buffer, 0, buffer.length, start);
      return buffer.toString('utf8');
    } finally {
      await handle.close();
    }
  },
};

interface CacheEntry extends TranscriptStat {
  readonly meta: SessionMeta;
}

/**
 * ポーリングのたびに読み直さないためのキャッシュ。
 * セッション数ぶんしか増えないので、上限は設けていない。
 */
const cache = new Map<string, CacheEntry>();

/** テストから状態を持ち越さないためのリセット。 */
export const clearSessionMetaCache = (): void => {
  cache.clear();
};

export interface ReadSessionMetaOptions {
  /** `~/.claude/projects` を探す起点。既定は実行ユーザーのホーム */
  readonly home?: string;
  /** コンテキスト上限の明示指定。未指定なら使用量から推定する */
  readonly contextLimit?: number | undefined;
  readonly source?: TranscriptSource;
}

/** 1 セッションぶんの transcript を読む。取得できなければ undefined。 */
export const readSessionMeta = async (
  agent: Agent,
  options: ReadSessionMetaOptions = {},
): Promise<SessionMeta | undefined> => {
  const path = buildTranscriptPath(options.home ?? homedir(), agent.cwd, agent.sessionId);
  if (path === null) {
    return undefined;
  }

  const source = options.source ?? fsTranscriptSource;

  try {
    const current = await source.stat(path);
    const cached = cache.get(path);
    if (cached !== undefined && cached.mtimeMs === current.mtimeMs && cached.size === current.size) {
      return cached.meta;
    }

    const chunk = await source.readTail(path, TAIL_BYTES);
    const meta = parseTranscript(chunk, { contextLimit: options.contextLimit });
    cache.set(path, { ...current, meta });
    return meta;
  } catch {
    // 未作成・権限不足・削除済みなど。付加情報なので黙って諦める
    return undefined;
  }
};
