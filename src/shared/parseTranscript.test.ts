import { describe, expect, it } from 'vitest';
import type { SessionMeta } from '../types/agent.js';
import {
  emptyScan,
  extendScan,
  scanModelId,
  toSessionMeta,
  toSingleLine,
  type ToSessionMetaOptions,
} from './parseTranscript.js';

const line = (value: unknown): string => JSON.stringify(value);

/** 1 回きりの走査。増分を跨がないケースはこれで書く。 */
const parse = (chunk: string, options: ToSessionMetaOptions = {}): SessionMeta =>
  toSessionMeta(extendScan(emptyScan(), chunk), options);

const lastPrompt = (text: string) => ({ type: 'last-prompt', lastPrompt: text });
const assistant = (usage: unknown) => ({ type: 'assistant', message: { usage } });
const modelAttachment = (modelId: unknown) => ({
  type: 'attachment',
  attachment: { type: 'model', identity: { modelId } },
});

/** サブエージェントを起動する assistant 行。 */
const spawn = (id: string, name = 'Agent', input: unknown = {}, timestamp?: string) => ({
  type: 'assistant',
  ...(timestamp === undefined ? {} : { timestamp }),
  message: { content: [{ type: 'tool_use', id, name, input }] },
});

/** 結果が返った user 行。 */
const toolResult = (toolUseId: string, content?: unknown) => ({
  type: 'user',
  message: {
    content: [
      { type: 'tool_result', tool_use_id: toolUseId, ...(content === undefined ? {} : { content }) },
    ],
  },
});

/** 非同期サブエージェントの起動を受理しただけの user 行。 */
const asyncReceipt = (toolUseId: string, agentId = 'a11cf0b4aefc68100') =>
  toolResult(toolUseId, [
    {
      type: 'text',
      text: `Async agent launched successfully. (This tool result is internal…)\nagentId: ${agentId} (internal ID - do not mention to user.)`,
    },
  ]);

/**
 * サブエージェントがバックグラウンド処理を待ってターンを終えたときの途中経過の通知。
 * 1 回目だけ `<tool-use-id>` が付き、2 回目以降は `<task-id>` だけになる。
 */
const interimNotification = (agentId: string, toolUseId?: string) => ({
  type: 'queue-operation',
  operation: 'enqueue',
  content: [
    '<task-notification>',
    `<task-id>${agentId}</task-id>`,
    ...(toolUseId === undefined ? [] : [`<tool-use-id>${toolUseId}</tool-use-id>`]),
    '<status>completed</status>',
    '<note>This agent stopped with background work of its own still running. … the result below may be interim.</note>',
    '<result>This agent has not reported yet: it is waiting on its own background work and will deliver its report through SubagentHandback when that finishes.',
    '</result>',
    '</task-notification>',
  ].join('\n'),
});

/** 途中経過の後の最終報告。`<task-notification>` ではなく `<agent-message>` で届く。 */
const handback = (agentId: string) => ({
  type: 'queue-operation',
  operation: 'enqueue',
  content: `<agent-message from="${agentId}">\n[Subagent hand-back] The text below is the final report of a subagent …\n  done\n</agent-message>`,
});

/** `task-id` だけで照合する、途中経過でない完了通知。 */
const notificationByTaskId = (agentId: string) => ({
  type: 'queue-operation',
  operation: 'enqueue',
  content: `<task-notification>\n<task-id>${agentId}</task-id>\n<status>completed</status>\n</task-notification>`,
});

/** 完了通知を載せた queue-operation 行。 */
const notification = (toolUseId: string) => ({
  type: 'queue-operation',
  operation: 'enqueue',
  content: `<task-notification>\n<task-id>a1d6895b</task-id>\n<tool-use-id>${toolUseId}</tool-use-id>\n`,
});

/** 完了通知を載せた attachment 行。 */
const queuedCommand = (toolUseId: string) => ({
  type: 'attachment',
  attachment: {
    type: 'queued_command',
    prompt: `<task-notification>\n<tool-use-id>${toolUseId}</tool-use-id>\n`,
  },
});

describe('toSingleLine', () => {
  it('改行やタブを空白へ潰す', () => {
    expect(toSingleLine('a\nb\tc')).toBe('a b c');
  });

  it('連続する空白をまとめて前後を削る', () => {
    expect(toSingleLine('  a   b  ')).toBe('a b');
  });
});

describe('走査の基本', () => {
  it('last-prompt から最終プロンプトを取り出す', () => {
    expect(parse(line(lastPrompt('テストを書いて'))).lastPrompt).toBe('テストを書いて');
  });

  it('last-prompt が複数あれば最後のものを使う', () => {
    const chunk = [line(lastPrompt('古い')), line(lastPrompt('新しい'))].join('\n');
    expect(parse(chunk).lastPrompt).toBe('新しい');
  });

  it('プロンプトの改行は空白へ潰す', () => {
    expect(parse(line(lastPrompt('a\nb'))).lastPrompt).toBe('a b');
  });

  it('空のプロンプトは無視する', () => {
    expect(parse(line(lastPrompt(''))).lastPrompt).toBeUndefined();
  });

  it('assistant の usage からトークン使用量を取り出す', () => {
    const meta = parse(line(assistant({ input_tokens: 2, cache_read_input_tokens: 99_998 })));
    expect(meta.tokens).toEqual({ used: 100_000, limit: 200_000, ratio: 0.5 });
  });

  it('usage が複数あれば最後のものを使う', () => {
    const chunk = [
      line(assistant({ input_tokens: 10 })),
      line(assistant({ input_tokens: 20 })),
    ].join('\n');
    expect(parse(chunk).tokens?.used).toBe(20);
  });

  it('コンテキスト上限を明示指定できる', () => {
    const meta = parse(line(assistant({ input_tokens: 50_000 })), { contextLimit: 100_000 });
    expect(meta.tokens?.ratio).toBe(0.5);
  });

  it('壊れた JSON 行は読み飛ばす', () => {
    const chunk = ['{"type":"assis', line(lastPrompt('やって'))].join('\n');
    expect(parse(chunk).lastPrompt).toBe('やって');
  });

  it('関係のない行は無視する', () => {
    const chunk = [
      line({ type: 'user', message: {} }),
      line({ type: 'mode', mode: 'normal' }),
    ].join('\n');
    expect(parse(chunk)).toEqual({ lastPrompt: undefined, tokens: undefined, subagents: [] });
  });

  it('usage を持たない assistant 行は無視する', () => {
    expect(parse(line({ type: 'assistant', message: {} })).tokens).toBeUndefined();
  });

  it('JSON が object でない行は無視する', () => {
    expect(parse(['123', '"text"', 'null'].join('\n')).lastPrompt).toBeUndefined();
  });

  it('空入力でも壊れない', () => {
    expect(parse('')).toEqual({ lastPrompt: undefined, tokens: undefined, subagents: [] });
  });
});

describe('モデル ID', () => {
  it('attachment からコンテキスト上限を決める', () => {
    const chunk = [
      line(modelAttachment('claude-opus-5[1m]')),
      line(assistant({ input_tokens: 159_645 })),
    ].join('\n');
    expect(parse(chunk).tokens?.limit).toBe(1_000_000);
  });

  it('attachment が無ければ使用量からの推定に戻る', () => {
    expect(parse(line(assistant({ input_tokens: 159_645 }))).tokens?.limit).toBe(200_000);
  });

  it('後から現れたモデル ID で上書きする', () => {
    const chunk = [
      line(modelAttachment('claude-opus-5[1m]')),
      line(modelAttachment('claude-opus-5')),
      line(assistant({ input_tokens: 159_645 })),
    ].join('\n');
    expect(parse(chunk).tokens?.limit).toBe(200_000);
  });

  it('文字列の中身として現れるだけの行は拾わない', () => {
    const echoed = line({
      type: 'user',
      message: { content: line(modelAttachment('claude-opus-5[1m]')) },
    });
    const chunk = [echoed, line(assistant({ input_tokens: 159_645 }))].join('\n');
    expect(parse(chunk).tokens?.limit).toBe(200_000);
  });

  it('modelId が文字列でなければ無視する', () => {
    const chunk = [line(modelAttachment(42)), line(assistant({ input_tokens: 159_645 }))].join('\n');
    expect(parse(chunk).tokens?.limit).toBe(200_000);
  });

  it('明示指定はモデル ID より優先する', () => {
    const chunk = [
      line(modelAttachment('claude-opus-5[1m]')),
      line(assistant({ input_tokens: 100_000 })),
    ].join('\n');
    expect(parse(chunk, { contextLimit: 400_000 }).tokens?.limit).toBe(400_000);
  });

  it('走査結果に無ければ fallbackModelId を使う', () => {
    const meta = parse(line(assistant({ input_tokens: 100_000 })), {
      fallbackModelId: 'claude-opus-5[1m]',
    });
    expect(meta.tokens?.limit).toBe(1_000_000);
  });

  it('走査結果のモデル ID を fallbackModelId より優先する', () => {
    const chunk = [
      line(modelAttachment('claude-opus-5')),
      line(assistant({ input_tokens: 100_000 })),
    ].join('\n');
    expect(parse(chunk, { fallbackModelId: 'claude-opus-5[1m]' }).tokens?.limit).toBe(200_000);
  });
});

describe('scanModelId', () => {
  it('先頭側の断片からモデル ID を拾う', () => {
    expect(scanModelId(line(modelAttachment('claude-opus-5[1m]')))).toBe('claude-opus-5[1m]');
  });

  it('モデル ID が無ければ undefined を返す', () => {
    expect(scanModelId(line(lastPrompt('やって')))).toBeUndefined();
  });
});

describe('実行中サブエージェント', () => {
  it('完了していない Agent の呼び出しを実行中として拾う', () => {
    const chunk = line(
      spawn('toolu_1', 'Agent', { subagent_type: 'general-purpose', description: '調査' }),
    );

    expect(parse(chunk).subagents).toEqual([
      {
        toolUseId: 'toolu_1',
        type: 'general-purpose',
        description: '調査',
        startedAt: undefined,
      },
    ]);
  });

  it('tool_use の timestamp を起動時刻にする', () => {
    const chunk = line(spawn('toolu_1', 'Agent', {}, '2026-09-04T14:47:20.967Z'));
    expect(parse(chunk).subagents[0]?.startedAt).toBe(Date.parse('2026-09-04T14:47:20.967Z'));
  });

  it('timestamp が解釈できなければ起動時刻は undefined にする', () => {
    const chunk = line(spawn('toolu_1', 'Agent', {}, 'いつか'));
    expect(parse(chunk).subagents[0]?.startedAt).toBeUndefined();
  });

  it('非同期起動を受理しただけの tool_result では完了にしない', () => {
    // 現行の Agent はバックグラウンドで走り、起動から 1〜2 秒でこの結果が返る
    const chunk = [line(spawn('toolu_1')), line(asyncReceipt('toolu_1'))].join('\n');
    expect(parse(chunk).subagents).toHaveLength(1);
  });

  it('queue-operation の完了通知で実行中から外す', () => {
    const chunk = [
      line(spawn('toolu_1')),
      line(asyncReceipt('toolu_1')),
      line(notification('toolu_1')),
    ].join('\n');
    expect(parse(chunk).subagents).toEqual([]);
  });

  it('queued_command の完了通知でも実行中から外す', () => {
    const chunk = [line(spawn('toolu_1')), line(queuedCommand('toolu_1'))].join('\n');
    expect(parse(chunk).subagents).toEqual([]);
  });

  it('別の tool_use を指す完了通知では外さない', () => {
    // バックグラウンドの Bash も同じ形式の通知を出す
    const chunk = [line(spawn('toolu_1')), line(notification('toolu_other'))].join('\n');
    expect(parse(chunk).subagents).toHaveLength(1);
  });

  it('同期実行だった旧版の tool_result は完了として扱う', () => {
    const chunk = [line(spawn('toolu_1')), line(toolResult('toolu_1'))].join('\n');
    expect(parse(chunk).subagents).toEqual([]);
  });

  it('複数走っていれば起動した順に並べる', () => {
    const chunk = [
      line(spawn('toolu_1')),
      line(spawn('toolu_2')),
      line(spawn('toolu_3')),
      line(notification('toolu_2')),
    ].join('\n');

    expect(parse(chunk).subagents.map((item) => item.toolUseId)).toEqual(['toolu_1', 'toolu_3']);
  });

  it('旧版のツール名 Task も拾う', () => {
    expect(parse(line(spawn('toolu_1', 'Task'))).subagents).toHaveLength(1);
  });

  it('サブエージェント以外のツールは拾わない', () => {
    expect(parse(line(spawn('toolu_1', 'Bash'))).subagents).toEqual([]);
  });

  it('subagent_type や description が無くても空文字で埋める', () => {
    expect(parse(line(spawn('toolu_1', 'Agent', {}))).subagents).toEqual([
      { toolUseId: 'toolu_1', type: '', description: '', startedAt: undefined },
    ]);
  });

  it('description の改行は空白へ潰す', () => {
    const chunk = line(spawn('toolu_1', 'Agent', { description: 'a\nb' }));
    expect(parse(chunk).subagents[0]?.description).toBe('a b');
  });

  it('content が配列でなくても壊れない', () => {
    const chunk = line({ type: 'assistant', message: { content: 'text' } });
    expect(parse(chunk).subagents).toEqual([]);
  });

  it('id が無い tool_use は拾わない', () => {
    const chunk = line({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Agent' }] },
    });
    expect(parse(chunk).subagents).toEqual([]);
  });

  it('途中経過の通知では外さない', () => {
    const chunk = [
      line(spawn('toolu_1')),
      line(asyncReceipt('toolu_1', 'agent1')),
      line(interimNotification('agent1', 'toolu_1')),
      line(interimNotification('agent1')),
    ].join('\n');
    expect(parse(chunk).subagents).toHaveLength(1);
  });

  it('途中経過の後の最終報告で実行中から外す', () => {
    // 実測した順序: 受理 → 途中経過（tool-use-id 付き）→ 途中経過（task-id のみ）→ 最終報告
    const chunk = [
      line(spawn('toolu_1')),
      line(asyncReceipt('toolu_1', 'agent1')),
      line(interimNotification('agent1', 'toolu_1')),
      line(interimNotification('agent1')),
      line(handback('agent1')),
    ].join('\n');
    expect(parse(chunk).subagents).toEqual([]);
  });

  it('queued_command の最終報告でも実行中から外す', () => {
    const chunk = [
      line(spawn('toolu_1')),
      line(asyncReceipt('toolu_1', 'agent1')),
      line({ type: 'attachment', attachment: { type: 'queued_command', prompt: handback('agent1').content } }),
    ].join('\n');
    expect(parse(chunk).subagents).toEqual([]);
  });

  it('hand-back の枠を持たない agent-message では外さない', () => {
    // サブエージェントは途中で親へメッセージを送ることもある
    const chunk = [
      line(spawn('toolu_1')),
      line(asyncReceipt('toolu_1', 'agent1')),
      line({
        type: 'queue-operation',
        operation: 'enqueue',
        content: '<agent-message from="agent1">\n確認したいことがあります\n</agent-message>',
      }),
    ].join('\n');
    expect(parse(chunk).subagents).toHaveLength(1);
  });

  it('別のサブエージェントの最終報告では外さない', () => {
    const chunk = [
      line(spawn('toolu_1')),
      line(asyncReceipt('toolu_1', 'agent1')),
      line(handback('agent2')),
    ].join('\n');
    expect(parse(chunk).subagents).toHaveLength(1);
  });

  it('task-id だけの完了通知でも agentId で照合して外す', () => {
    const chunk = [
      line(spawn('toolu_1')),
      line(asyncReceipt('toolu_1', 'agent1')),
      line(notificationByTaskId('agent1')),
    ].join('\n');
    expect(parse(chunk).subagents).toEqual([]);
  });

  it('起動を拾っていない受理通知の agentId は覚えない', () => {
    const scan = extendScan(emptyScan(), line(asyncReceipt('toolu_1', 'agent1')));
    expect(scan.agentIds.size).toBe(0);
  });

  it('agentId を含まない受理通知でも壊れない', () => {
    const chunk = [
      line(spawn('toolu_1')),
      line(toolResult('toolu_1', 'Async agent launched successfully.')),
    ].join('\n');
    const scan = extendScan(emptyScan(), chunk);
    expect(toSessionMeta(scan).subagents).toHaveLength(1);
    expect(scan.agentIds.size).toBe(0);
  });

  it('完了したら agentId の対応も消す', () => {
    const chunk = [
      line(spawn('toolu_1')),
      line(asyncReceipt('toolu_1', 'agent1')),
      line(notification('toolu_1')),
    ].join('\n');
    expect(extendScan(emptyScan(), chunk).agentIds.size).toBe(0);
  });

  it('文字列として通知を含むだけの行は拾わない', () => {
    const echoed = line({ type: 'user', message: { content: line(notification('toolu_1')) } });
    const chunk = [line(spawn('toolu_1')), echoed].join('\n');
    expect(parse(chunk).subagents).toHaveLength(1);
  });
});

describe('extendScan の累積', () => {
  it('前回の走査結果を引き継ぐ', () => {
    const first = extendScan(emptyScan(), line(lastPrompt('古い')));
    const second = extendScan(first, line(assistant({ input_tokens: 100 })));

    expect(toSessionMeta(second)).toMatchObject({
      lastPrompt: '古い',
      tokens: { used: 100 },
    });
  });

  it('増分で見つかった値が前回を上書きする', () => {
    const first = extendScan(emptyScan(), line(lastPrompt('古い')));
    const second = extendScan(first, line(lastPrompt('新しい')));

    expect(toSessionMeta(second).lastPrompt).toBe('新しい');
  });

  it('前回の増分で起動したサブエージェントを保持し続ける', () => {
    // 起動行が読み取り窓の外へ出ても消えないことが、この方式の要点
    const first = extendScan(emptyScan(), line(spawn('toolu_1')));
    const second = extendScan(first, line(assistant({ input_tokens: 1 })));

    expect(toSessionMeta(second).subagents.map((item) => item.toolUseId)).toEqual(['toolu_1']);
  });

  it('後から来た増分の完了通知で実行中から外す', () => {
    const first = extendScan(emptyScan(), line(spawn('toolu_1')));
    const second = extendScan(first, line(notification('toolu_1')));

    expect(toSessionMeta(second).subagents).toEqual([]);
  });

  it('前回の増分で覚えた agentId で最終報告を照合する', () => {
    const first = extendScan(
      emptyScan(),
      [line(spawn('toolu_1')), line(asyncReceipt('toolu_1', 'agent1'))].join('\n'),
    );
    const second = extendScan(first, line(interimNotification('agent1', 'toolu_1')));
    const third = extendScan(second, line(handback('agent1')));

    expect(toSessionMeta(second).subagents).toHaveLength(1);
    expect(toSessionMeta(third).subagents).toEqual([]);
  });

  it('元の走査結果は書き換えない', () => {
    const first = extendScan(emptyScan(), line(spawn('toolu_1')));
    extendScan(first, line(notification('toolu_1')));

    expect(toSessionMeta(first).subagents).toHaveLength(1);
  });

  it('起動を拾っていない完了通知は無視する', () => {
    const scan = extendScan(emptyScan(), line(notification('toolu_1')));
    expect(toSessionMeta(scan).subagents).toEqual([]);
  });
});
