import { open, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { parseTranscript } from '../shared/parseTranscript.js';
import { buildTranscriptPath } from '../shared/transcriptPath.js';
import type { Agent, SessionMeta } from '../types/agent.js';

/**
 * セッション transcript から最終プロンプトとトークン使用量を読む。
 *
 * transcript は数 MB に達するので、毎回の全読みは避けて先頭と末尾だけを切り出す。
 * 末尾 64KB あれば `last-prompt` と直近の `usage` の双方が入ることを実測で確認した。
 * コンテキスト上限の判別に使うモデル ID は先頭側にしか無いため、先頭も読む。
 * 読めない・見つからない場合は例外を投げず undefined を返し、一覧表示を止めない。
 */

/** 末尾から読み取るバイト数。 */
export const TAIL_BYTES = 64 * 1024;

/**
 * 先頭から読み取るバイト数。
 *
 * モデルを知らせる `attachment` 行は実測した 19 セッションすべてで
 * 先頭 5.3KB 以内（6〜15 行目）にあった。余裕を見て 16KB とする。
 */
export const HEAD_BYTES = 16 * 1024;

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
  /** 先頭 `bytes` ぶんを UTF-8 文字列として読む */
  readonly readHead: (path: string, bytes: number) => Promise<string>;
}

/** ファイルの一部を読む。`fromEnd` で末尾起点に切り替える。 */
const readSlice = async (path: string, bytes: number, fromEnd: boolean): Promise<string> => {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const start = fromEnd ? Math.max(size - bytes, 0) : 0;
    const length = Math.min(bytes, size - start);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
};

export const fsTranscriptSource: TranscriptSource = {
  stat: async (path) => {
    const stats = await stat(path);
    return { mtimeMs: stats.mtimeMs, size: stats.size };
  },
  readTail: (path, bytes) => readSlice(path, bytes, true),
  readHead: (path, bytes) => readSlice(path, bytes, false),
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

    // 先頭（モデル ID）→ 末尾（最新のプロンプトと使用量）の順に繋ぐ。
    // 行単位のパーサなので、切れ目で壊れた行は JSON.parse に失敗して捨てられる。
    // 末尾読みに全部入るサイズなら先頭は読まない
    const tail = await source.readTail(path, TAIL_BYTES);
    const head = current.size > TAIL_BYTES ? await source.readHead(path, HEAD_BYTES) : '';
    const meta = parseTranscript(`${head}\n${tail}`, { contextLimit: options.contextLimit });
    cache.set(path, { ...current, meta });
    return meta;
  } catch {
    // 未作成・権限不足・削除済みなど。付加情報なので黙って諦める
    return undefined;
  }
};
