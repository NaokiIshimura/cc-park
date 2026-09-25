import type { SessionMeta, Subagent } from '../types/agent.js';
import { toTokenUsage, type RawUsage } from './tokenUsage.js';

/**
 * セッション transcript（JSONL）から、表示に使う情報だけを取り出す。
 *
 * 出力仕様は非公開で将来変更されうるため、想定外の行はすべて読み飛ばす。
 *
 * transcript は追記しかされない（compact 時は `continued-in` を残して別ファイルへ移る）ので、
 * 走査は「前回の結果に増分を足す」形にしてある。末尾の一定量だけを毎回読み直す作りだと、
 * 非同期サブエージェントのように起動から完了まで長くかかるものが、その間に書かれた行に
 * 押し出されて窓の外へ出てしまう。
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
 * 添付。`attachment.type` で中身が変わる。
 *
 * - `model`: 使用中のモデル。transcript の先頭付近と、途中でモデルを切り替えたときに現れる。
 *   `assistant` 行の `message.model` は `claude-opus-5` のように `[1m]` が落ちているが、
 *   こちらの `identity.modelId` には残っているため、コンテキスト上限の判別に使える。
 * - `queued_command`: キューへ積まれた入力。サブエージェントの完了通知もここに現れる。
 */
interface AttachmentEntry {
  readonly type?: unknown;
  readonly attachment?: {
    readonly type?: unknown;
    readonly identity?: { readonly modelId?: unknown };
    readonly prompt?: unknown;
  };
}

/**
 * 入力キューの操作を記録する行。
 *
 * 非同期サブエージェントの完了通知は、まずここへ `enqueue` として現れる。
 * `queued_command` の添付は親が待機中だと即座に処理されて残らないことがあるため、
 * 完了の検出はこちらを主に見る。
 */
interface QueueOperationEntry {
  readonly type: 'queue-operation';
  readonly content?: unknown;
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
  readonly content?: unknown;
}

interface ContentEntry {
  readonly type?: unknown;
  readonly timestamp?: unknown;
  readonly message?: { readonly content?: unknown };
}

type Entry =
  | LastPromptEntry
  | AssistantEntry
  | AttachmentEntry
  | QueueOperationEntry
  | ContentEntry
  | { readonly type?: unknown };

/**
 * サブエージェントを起動するツールの名前。
 *
 * 現行は `Agent`、以前の版は `Task` だった。どちらの transcript も残っているため両方見る。
 */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set(['Agent', 'Task']);

/**
 * 非同期起動を受理しただけの `tool_result` を見分ける印。
 *
 * 現行の `Agent` はバックグラウンドで走るため、`tool_result` は起動から 1〜2 秒で返る
 * 受理通知でしかない。これを完了とみなすと、数分走るサブエージェントが一瞬で消える。
 * 同期実行だった旧版の transcript とは、この印の有無で区別する。
 */
const ASYNC_LAUNCH_MARKER = 'Async agent launched successfully';

/** 受理通知から、完了通知の照合に使う `agentId` を取り出す。 */
const ASYNC_LAUNCH_AGENT_ID = /agentId: ([A-Za-z0-9]+)/;

/** 完了通知の目印。正規表現をかける前に、この語を含む行だけに絞る。 */
const TASK_NOTIFICATION_MARKER = '<task-notification>';

/**
 * 途中経過の通知を見分ける印。
 *
 * サブエージェントが自分のバックグラウンド処理を待ってターンを終えるたびに、
 * `status=completed` の通知が届く。完了とみなすと、実際には走り続けているのに消える
 * （実測では稼働 106 秒に対して 15 秒で消えていた）。`<status>` では区別できないので本文で見る。
 */
const INTERIM_NOTIFICATION_MARKER = 'has not reported yet';

/** 完了通知から起動側の `tool_use` ID を取り出す。途中経過の 2 回目以降には付かない。 */
const TASK_NOTIFICATION_TOOL_USE_ID = /<tool-use-id>([^<]+)<\/tool-use-id>/g;

/** 完了通知から `agentId` を取り出す。どの通知にも付く。 */
const TASK_NOTIFICATION_TASK_ID = /<task-id>([^<]+)<\/task-id>/g;

/**
 * 最終報告の目印。
 *
 * バックグラウンド処理を待っていたサブエージェントの最終報告は、`<task-notification>` ではなく
 * `<agent-message from="<agentId>">` として届く。サブエージェントは途中で親へ
 * メッセージを送ることもあるため、hand-back の枠を持つものだけを完了とみなす。
 */
const HANDBACK_MARKER = '[Subagent hand-back]';

/** 最終報告から送り主の `agentId` を取り出す。 */
const HANDBACK_AGENT_ID = /<agent-message from="([^"]+)">/g;

/** 表示が崩れないよう、改行・タブを空白へ潰して 1 行にする。 */
export const toSingleLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * 走査の累積結果。呼び出し側が保持して次の増分へ引き渡す。
 *
 * 単一の値は後から現れたもので上書きし、サブエージェントは完了を検出した時点で外す。
 * よって `started` と `agentIds` に残るのは実行中のぶんだけで、走査を続けても際限なく増えることはない。
 */
export interface TranscriptScan {
  readonly lastPrompt: string | undefined;
  readonly usage: RawUsage | undefined;
  readonly modelId: string | undefined;
  /** まだ完了していない起動。`tool_use` ID をキーに、起動した順で並ぶ */
  readonly started: ReadonlyMap<string, Subagent>;
  /** 実行中のものの `agentId` から `tool_use` ID への対応。完了通知の照合に使う */
  readonly agentIds: ReadonlyMap<string, string>;
}

/** 走査中の書き換え用。`TranscriptScan` と同じ項目を可変で持つ。 */
interface MutableScan {
  lastPrompt: string | undefined;
  usage: RawUsage | undefined;
  modelId: string | undefined;
  readonly started: Map<string, Subagent>;
  readonly agentIds: Map<string, string>;
}

/** 何も読んでいない状態の走査結果。 */
export const emptyScan = (): TranscriptScan => ({
  lastPrompt: undefined,
  usage: undefined,
  modelId: undefined,
  started: new Map(),
  agentIds: new Map(),
});

/** ISO 文字列を epoch ms へ変換する。解釈できなければ undefined。 */
const toEpochMs = (value: unknown): number | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
};

/** `tool_result` の本文を 1 つの文字列にまとめる。本文が無ければ undefined。 */
const toResultText = (content: unknown): string | undefined => {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  return content
    .map((part) => (part as { readonly text?: unknown } | null)?.text)
    .filter((text): text is string => typeof text === 'string')
    .join('\n');
};

/** 実行中から外す。`agentId` の対応も一緒に消して、走査結果が増え続けないようにする。 */
const finish = (toolUseId: string, scan: MutableScan): void => {
  scan.started.delete(toolUseId);
  for (const [agentId, mapped] of scan.agentIds) {
    if (mapped === toolUseId) {
      scan.agentIds.delete(agentId);
    }
  }
};

/** `agentId` で実行中から外す。起動を拾っていない ID は空振りするだけ。 */
const finishByAgentId = (agentId: string, scan: MutableScan): void => {
  const toolUseId = scan.agentIds.get(agentId);
  if (toolUseId !== undefined) {
    finish(toolUseId, scan);
  }
};

/**
 * 完了通知・最終報告を拾い、実行中から外す。
 *
 * 通知はバックグラウンドの Bash でも出るが、起動を拾っていない ID は
 * 削除が空振りするだけなので、種別を見分ける必要はない。
 */
const scanNotification = (content: unknown, scan: MutableScan): void => {
  if (typeof content !== 'string') {
    return;
  }

  if (content.includes(HANDBACK_MARKER)) {
    for (const match of content.matchAll(HANDBACK_AGENT_ID)) {
      if (match[1] !== undefined) {
        finishByAgentId(match[1], scan);
      }
    }
    return;
  }

  // 途中経過はまだ走っているので外さない
  if (!content.includes(TASK_NOTIFICATION_MARKER) || content.includes(INTERIM_NOTIFICATION_MARKER)) {
    return;
  }

  for (const match of content.matchAll(TASK_NOTIFICATION_TOOL_USE_ID)) {
    if (match[1] !== undefined) {
      finish(match[1], scan);
    }
  }
  for (const match of content.matchAll(TASK_NOTIFICATION_TASK_ID)) {
    if (match[1] !== undefined) {
      finishByAgentId(match[1], scan);
    }
  }
};

/** `message.content` を走査して、サブエージェントの起動と完了を記録する。 */
const scanContent = (content: unknown, startedAt: number | undefined, scan: MutableScan): void => {
  if (!Array.isArray(content)) {
    return;
  }

  for (const block of content as readonly ContentBlock[]) {
    if (block === null || typeof block !== 'object') {
      continue;
    }

    if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
      const text = toResultText(block.content);
      // 非同期起動の受理は完了ではない。同期実行だった旧版の結果だけを完了として扱う
      if (text === undefined || !text.includes(ASYNC_LAUNCH_MARKER)) {
        finish(block.tool_use_id, scan);
        continue;
      }
      // 2 回目以降の通知と最終報告は agentId でしか照合できないので、対応を覚えておく
      const agentId = ASYNC_LAUNCH_AGENT_ID.exec(text)?.[1];
      if (agentId !== undefined && scan.started.has(block.tool_use_id)) {
        scan.agentIds.set(agentId, block.tool_use_id);
      }
      continue;
    }

    if (
      block.type === 'tool_use' &&
      typeof block.name === 'string' &&
      SUBAGENT_TOOL_NAMES.has(block.name) &&
      typeof block.id === 'string'
    ) {
      const { subagent_type: type, description } = block.input ?? {};
      scan.started.set(block.id, {
        toolUseId: block.id,
        type: typeof type === 'string' ? type : '',
        description: typeof description === 'string' ? toSingleLine(description) : '',
        startedAt,
      });
    }
  }
};

/** JSONL の 1 行を走査する。 */
const scanLine = (line: string, scan: MutableScan): void => {
  if (line === '') {
    return;
  }

  let entry: Entry;
  try {
    entry = JSON.parse(line) as Entry;
  } catch {
    return;
  }

  if (entry === null || typeof entry !== 'object') {
    return;
  }

  // 後に現れたものほど新しいので、見つけるたびに上書きする
  if (entry.type === 'last-prompt') {
    const value = (entry as LastPromptEntry).lastPrompt;
    if (typeof value === 'string' && value !== '') {
      scan.lastPrompt = toSingleLine(value);
    }
    return;
  }

  if (entry.type === 'assistant') {
    const candidate = (entry as AssistantEntry).message?.usage;
    if (candidate !== undefined && candidate !== null && typeof candidate === 'object') {
      scan.usage = candidate;
    }
    // assistant 行には tool_use が載るので、続けて content も見る
    const content = entry as ContentEntry;
    scanContent(content.message?.content, toEpochMs(content.timestamp), scan);
    return;
  }

  if (entry.type === 'queue-operation') {
    scanNotification((entry as QueueOperationEntry).content, scan);
    return;
  }

  // 文字列として同じ内容を含むだけの行（ツール出力の echo など）を拾わないよう、
  // 構造で判定する
  const attachment = (entry as AttachmentEntry).attachment;
  if (attachment?.type === 'model') {
    const candidate = attachment.identity?.modelId;
    if (typeof candidate === 'string' && candidate !== '') {
      scan.modelId = candidate;
    }
    return;
  }

  if (attachment?.type === 'queued_command') {
    scanNotification(attachment.prompt, scan);
    return;
  }

  // tool_result は user 行に載る
  const content = entry as ContentEntry;
  scanContent(content.message?.content, toEpochMs(content.timestamp), scan);
};

/**
 * 走査結果に JSONL の断片を足し込む。
 *
 * `chunk` は行の途中で終わっていてはならない。切れた行は `JSON.parse` に失敗して
 * 黙って捨てられるため、呼び出し側が行境界で切って渡すこと。
 */
export const extendScan = (previous: TranscriptScan, chunk: string): TranscriptScan => {
  const scan: MutableScan = {
    lastPrompt: previous.lastPrompt,
    usage: previous.usage,
    modelId: previous.modelId,
    started: new Map(previous.started),
    agentIds: new Map(previous.agentIds),
  };

  for (const line of chunk.split('\n')) {
    scanLine(line, scan);
  }

  return scan;
};

/**
 * 先頭側の断片からモデル ID だけを拾う。
 *
 * 先頭は途中で切れているので「`tool_use` はあるが `tool_result` は切れた先にある」
 * 状態が起こりうる。実行中の判定に混ぜると完了済みの呼び出しを永久に実行中と
 * 誤認するため、ここではモデル ID 以外を捨てる。
 */
export const scanModelId = (chunk: string): string | undefined =>
  extendScan(emptyScan(), chunk).modelId;

export interface ToSessionMetaOptions {
  /** コンテキスト上限の明示指定。未指定なら使用量から推定する */
  readonly contextLimit?: number | undefined;
  /** 走査結果にモデル ID が無いときの代わり。先頭側から拾ったものを渡す */
  readonly fallbackModelId?: string | undefined;
}

/** 走査結果を表示用の付加情報へ変換する。 */
export const toSessionMeta = (
  scan: TranscriptScan,
  options: ToSessionMetaOptions = {},
): SessionMeta => {
  const modelId = scan.modelId ?? options.fallbackModelId;

  return {
    lastPrompt: scan.lastPrompt,
    tokens:
      scan.usage === undefined
        ? undefined
        : toTokenUsage(scan.usage, options.contextLimit, modelId),
    subagents: [...scan.started.values()],
  };
};
