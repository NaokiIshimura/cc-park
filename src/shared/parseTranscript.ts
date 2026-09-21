import type { SessionMeta } from '../types/agent.js';
import { toTokenUsage, type RawUsage } from './tokenUsage.js';

/**
 * セッション transcript（JSONL）の断片から、表示に使う情報だけを取り出す。
 *
 * 出力仕様は非公開で将来変更されうるため、想定外の行はすべて読み飛ばす。
 * 末尾だけを切り出した断片を渡される前提なので、先頭の欠けた行は
 * `JSON.parse` に失敗して自然に捨てられる（行数で切らないのは、
 * ちょうど行頭から始まっていた場合に有効な行を落とさないため）。
 */

/** 最後に与えられたプロンプトを保持する行。Claude Code 側で切り詰め済み。 */
interface LastPromptEntry {
  readonly type: 'last-prompt';
  readonly lastPrompt?: unknown;
}

/** アシスタントの応答。`message.usage` にトークン使用量が入る。 */
interface AssistantEntry {
  readonly type: 'assistant';
  readonly message?: { readonly usage?: RawUsage };
}

type Entry = LastPromptEntry | AssistantEntry | { readonly type?: unknown };

/** 表示が崩れないよう、改行・タブを空白へ潰して 1 行にする。 */
export const toSingleLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

export interface ParseTranscriptOptions {
  /** コンテキスト上限の明示指定。未指定なら使用量から推定する */
  readonly contextLimit?: number | undefined;
}

/** JSONL の断片から最終プロンプトとトークン使用量を取り出す。 */
export const parseTranscript = (
  chunk: string,
  options: ParseTranscriptOptions = {},
): SessionMeta => {
  let lastPrompt: string | undefined;
  let usage: RawUsage | undefined;

  for (const line of chunk.split('\n')) {
    if (line === '') {
      continue;
    }

    let entry: Entry;
    try {
      entry = JSON.parse(line) as Entry;
    } catch {
      continue;
    }

    if (entry === null || typeof entry !== 'object') {
      continue;
    }

    // 後に現れたものほど新しいので、見つけるたびに上書きする
    if (entry.type === 'last-prompt') {
      const value = (entry as LastPromptEntry).lastPrompt;
      if (typeof value === 'string' && value !== '') {
        lastPrompt = toSingleLine(value);
      }
      continue;
    }

    if (entry.type === 'assistant') {
      const candidate = (entry as AssistantEntry).message?.usage;
      if (candidate !== undefined && candidate !== null && typeof candidate === 'object') {
        usage = candidate;
      }
    }
  }

  return {
    lastPrompt,
    tokens: usage === undefined ? undefined : toTokenUsage(usage, options.contextLimit),
  };
};
