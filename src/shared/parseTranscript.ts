import type { SessionMeta, Subagent } from '../types/agent.js';
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

/**
 * 使用中のモデルを知らせる添付。transcript の先頭付近と、
 * セッション途中でモデルを切り替えたときに現れる。
 *
 * `assistant` 行の `message.model` は `claude-opus-5` のように `[1m]` が落ちているが、
 * こちらの `modelId` には残っているため、コンテキスト上限の判別に使える。
 */
interface ModelAttachmentEntry {
  readonly type?: unknown;
  readonly attachment?: {
    readonly type?: unknown;
    readonly identity?: { readonly modelId?: unknown };
  };
}

/** `message.content` に並ぶブロック。サブエージェントの起動と完了を拾うために見る。 */
interface ContentBlock {
  readonly type?: unknown;
  /** tool_use のとき */
  readonly id?: unknown;
  readonly name?: unknown;
  readonly input?: { readonly subagent_type?: unknown; readonly description?: unknown };
  /** tool_result のとき */
  readonly tool_use_id?: unknown;
}

interface ContentEntry {
  readonly type?: unknown;
  readonly message?: { readonly content?: unknown };
}

type Entry =
  | LastPromptEntry
  | AssistantEntry
  | ModelAttachmentEntry
  | ContentEntry
  | { readonly type?: unknown };

/**
 * サブエージェントを起動するツールの名前。
 *
 * 現行は `Agent`、以前の版は `Task` だった。どちらの transcript も残っているため両方見る。
 */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set(['Agent', 'Task']);

/** 表示が崩れないよう、改行・タブを空白へ潰して 1 行にする。 */
export const toSingleLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

export interface ParseTranscriptOptions {
  /** コンテキスト上限の明示指定。未指定なら使用量から推定する */
  readonly contextLimit?: number | undefined;
  /**
   * 先頭側の断片。モデル ID を拾うためだけに見る補助入力。
   *
   * 先頭は途中で切れているので「`tool_use` はあるが `tool_result` は切れた先にある」
   * 状態が起こりうる。実行中のサブエージェント判定にこれを混ぜると、完了済みの
   * 呼び出しを永久に実行中と誤認するため、判定には `chunk` だけを使う。
   */
  readonly head?: string;
}

/** 1 回の走査で拾う値。後から現れたものほど新しいので上書きしていく。 */
interface Scanned {
  lastPrompt: string | undefined;
  usage: RawUsage | undefined;
  modelId: string | undefined;
  /** 起動されたサブエージェント。tool_use ID をキーにする */
  readonly started: Map<string, Subagent>;
  /** 結果が返った tool_use ID */
  readonly finished: Set<string>;
}

/** `message.content` を走査して、サブエージェントの起動と完了を記録する。 */
const scanContent = (content: unknown, scanned: Scanned): void => {
  if (!Array.isArray(content)) {
    return;
  }

  for (const block of content as readonly ContentBlock[]) {
    if (block === null || typeof block !== 'object') {
      continue;
    }

    if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
      scanned.finished.add(block.tool_use_id);
      continue;
    }

    if (
      block.type === 'tool_use' &&
      typeof block.name === 'string' &&
      SUBAGENT_TOOL_NAMES.has(block.name) &&
      typeof block.id === 'string'
    ) {
      const { subagent_type: type, description } = block.input ?? {};
      scanned.started.set(block.id, {
        toolUseId: block.id,
        type: typeof type === 'string' ? type : '',
        description: typeof description === 'string' ? toSingleLine(description) : '',
      });
    }
  }
};

/** JSONL の断片を 1 行ずつ走査する。 */
const scan = (chunk: string, scanned: Scanned): Scanned => {
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
        scanned.lastPrompt = toSingleLine(value);
      }
      continue;
    }

    if (entry.type === 'assistant') {
      const candidate = (entry as AssistantEntry).message?.usage;
      if (candidate !== undefined && candidate !== null && typeof candidate === 'object') {
        scanned.usage = candidate;
      }
      // assistant 行には tool_use が載るので、続けて content も見る
      scanContent((entry as ContentEntry).message?.content, scanned);
      continue;
    }

    // 文字列として同じ内容を含むだけの行（ツール出力の echo など）を拾わないよう、
    // 構造で判定する
    const attachment = (entry as ModelAttachmentEntry).attachment;
    if (attachment?.type === 'model') {
      const candidate = attachment.identity?.modelId;
      if (typeof candidate === 'string' && candidate !== '') {
        scanned.modelId = candidate;
      }
      continue;
    }

    // tool_result は user 行に載る
    scanContent((entry as ContentEntry).message?.content, scanned);
  }

  return scanned;
};

/** 走査結果の入れ物を作る。 */
const emptyScanned = (): Scanned => ({
  lastPrompt: undefined,
  usage: undefined,
  modelId: undefined,
  started: new Map(),
  finished: new Set(),
});

/**
 * JSONL の断片から最終プロンプト・トークン使用量・実行中のサブエージェントを取り出す。
 *
 * `chunk` には末尾側の断片を渡す。先頭側は `options.head` へ分けて渡すこと。
 */
export const parseTranscript = (
  chunk: string,
  options: ParseTranscriptOptions = {},
): SessionMeta => {
  // 先頭 → 末尾の順に走査し、同じ項目は後から見た末尾側で上書きする
  const head = options.head === undefined ? emptyScanned() : scan(options.head, emptyScanned());
  const tail = scan(chunk, emptyScanned());

  const usage = tail.usage ?? head.usage;
  const modelId = tail.modelId ?? head.modelId;

  // 結果が返っていない呼び出しだけが実行中。起動を拾えていない tool_result は無視される
  const subagents = [...tail.started.values()].filter(
    (subagent) => !tail.finished.has(subagent.toolUseId),
  );

  return {
    lastPrompt: tail.lastPrompt ?? head.lastPrompt,
    tokens: usage === undefined ? undefined : toTokenUsage(usage, options.contextLimit, modelId),
    subagents,
  };
};
