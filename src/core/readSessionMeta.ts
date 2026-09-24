import { open, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import {
  emptyScan,
  extendScan,
  scanModelId,
  toSessionMeta,
  type TranscriptScan,
} from '../shared/parseTranscript.js';
import { buildTranscriptPath } from '../shared/transcriptPath.js';
import type { Agent, SessionMeta } from '../types/agent.js';

/**
 * セッション transcript から最終プロンプト・トークン使用量・実行中のサブエージェントを読む。
 *
 * transcript は数 MB に達するので全読みは避ける。初回だけ末尾をまとめて読み、
 * 以降は前回読んだ位置からの増分だけを読んで走査結果に足していく。
 * 末尾の一定量を毎回読み直す作りだと、非同期サブエージェントの起動行が、実行中に
 * 書かれた行に押し出されて窓の外へ出てしまう（実測で 290KB 離れた例がある）。
 *
 * コンテキスト上限の判別に使うモデル ID は先頭側にしか無いため、先頭も読む。
 * 読めない・見つからない場合は例外を投げず undefined を返し、一覧表示を止めない。
 */

/**
 * 初回に末尾から読み取るバイト数。
 *
 * 2 回目以降は増分だけなので、ここだけは広めに取る。実測した transcript では
 * サブエージェントの起動から完了通知まで最大 290KB 離れていたため、
 * 起動時点で既に走っているものも拾えるよう 512KB とする。
 */
export const INITIAL_TAIL_BYTES = 512 * 1024;

/**
 * 先頭から読み取るバイト数。
 *
 * モデルを知らせる `attachment` 行は実測した 19 セッションすべてで
 * 先頭 5.3KB 以内（6〜15 行目）にあった。余裕を見て 16KB とする。
 */
export const HEAD_BYTES = 16 * 1024;

/** 改行のバイト値。増分を行境界で切るために使う。 */
const LINE_FEED = 0x0a;

/** ファイルの状態。更新の有無をこれで判断する。 */
export interface TranscriptStat {
  readonly mtimeMs: number;
  readonly size: number;
}

/** 読み取りの実装。テストから差し替えられるよう切り出す。 */
export interface TranscriptSource {
  readonly stat: (path: string) => Promise<TranscriptStat>;
  /**
   * `start` から `bytes` ぶんを読む。
   *
   * 行境界で切るためにバイト列のまま返す。文字列にしてから切ると、
   * UTF-8 のバイト位置と文字位置がずれて次回の読み始めを誤る。
   */
  readonly readRange: (path: string, start: number, bytes: number) => Promise<Buffer>;
}

export const fsTranscriptSource: TranscriptSource = {
  stat: async (path) => {
    const stats = await stat(path);
    return { mtimeMs: stats.mtimeMs, size: stats.size };
  },
  readRange: async (path, start, bytes) => {
    if (bytes <= 0) {
      return Buffer.alloc(0);
    }
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, start);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  },
};

interface CacheEntry extends TranscriptStat {
  /** 次に読み始めるバイト位置。行境界に揃えてある */
  readonly offset: number;
  readonly scan: TranscriptScan;
  /** 先頭側から拾ったモデル ID。増分には現れないので持ち越す */
  readonly headModelId: string | undefined;
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

    // 読んだ位置より縮んでいたら別のファイルになったとみなし、末尾から読み直す
    const fresh = cached === undefined || current.size < cached.offset;
    const start = fresh ? Math.max(current.size - INITIAL_TAIL_BYTES, 0) : cached.offset;
    const buffer = await source.readRange(path, start, current.size - start);

    // 末尾が行の途中で切れていることがあるので、最後の改行までを処理して端数は次回へ回す
    const consumed = buffer.lastIndexOf(LINE_FEED) + 1;
    const scan = extendScan(
      fresh ? emptyScan() : cached.scan,
      buffer.subarray(0, consumed).toString('utf8'),
    );

    // 先頭を切り落としたときだけ、モデル ID を拾うために先頭も読む
    const headModelId = fresh
      ? start === 0
        ? undefined
        : scanModelId((await source.readRange(path, 0, HEAD_BYTES)).toString('utf8'))
      : cached.headModelId;

    const meta = toSessionMeta(scan, {
      contextLimit: options.contextLimit,
      fallbackModelId: headModelId,
    });
    cache.set(path, { ...current, offset: start + consumed, scan, headModelId, meta });
    return meta;
  } catch {
    // 未作成・権限不足・削除済みなど。付加情報なので黙って諦める
    return undefined;
  }
};
