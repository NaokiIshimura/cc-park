import type { Agent } from '../types/agent.js';

/** コマンドの組み立てに必要な最小限の情報。 */
export type ResumeTarget = Pick<Agent, 'sessionId' | 'cwd' | 'kind' | 'id'>;

/** 引用符なしでシェルへ渡せる文字だけで構成されているか */
const SAFE_PATH = /^[A-Za-z0-9_./@%+:,=-]+$/;

/** 貼り付けたシェルで解釈が変わらないよう、必要ならパスを単一引用符で囲む。 */
const quotePath = (path: string): string =>
  SAFE_PATH.test(path) ? path : `'${path.replaceAll("'", `'\\''`)}'`;

/**
 * セッションを開く claude コマンドを組み立てる。
 *
 * background セッションは `--resume` では開けず（`claude stop` してからになる）、
 * 短縮 ID を使った `claude attach` で開く。
 */
const buildClaudeCommand = (agent: ResumeTarget): string =>
  agent.kind === 'background' && agent.id !== undefined && agent.id !== ''
    ? `claude attach ${agent.id}`
    : `claude --resume ${agent.sessionId}`;

/**
 * セッションを開くコマンド文字列を組み立てる。
 *
 * 貼り付けてそのまま実行できるよう、セッションの作業ディレクトリへ移る `cd` を前に繋げる。
 */
export const buildResumeCommand = (agent: ResumeTarget): string => {
  const command = buildClaudeCommand(agent);
  if (agent.cwd === '') {
    return command;
  }
  return `cd ${quotePath(agent.cwd)} && ${command}`;
};
