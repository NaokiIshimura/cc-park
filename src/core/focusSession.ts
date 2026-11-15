import {
  buildFocusScript,
  buildTerminalScript,
  FOCUS_SCRIPT_FOUND,
  planFocus,
  toTtyPath,
} from '../shared/focusPlan.js';
import { appBundleName } from '../shared/launchApp.js';
import type { Agent } from '../types/agent.js';
import { execFileRunner, type CommandRunner } from './runCommand.js';

/**
 * セッションの画面（端末のタブ・アプリ）を前面に出す。
 *
 * iTerm2 / Terminal はセッションの tty でタブを探して選ぶ。それ以外のアプリと、
 * タブが見つからない・AppleScript を実行できない（オートメーションの許可が無いなど）場合は、
 * アプリを前面に出すだけにとどめる。失敗は例外ではなく Result 型で返し、UI を落とさない。
 */

export type FocusSessionResult =
  /**
   * `tab` はタブまで選べた、`app` はアプリを前面に出しただけ、
   * `terminal` は background セッションを Terminal の新しいウィンドウで開いた
   */
  | { readonly ok: true; readonly target: 'tab' | 'app' | 'terminal'; readonly app: string }
  | { readonly ok: false; readonly reason: string };

export interface FocusSessionOptions {
  readonly platform?: string;
  readonly runner?: CommandRunner;
}

const TIMEOUT_MS = 5000;

export const focusSession = async (
  agent: Agent,
  options: FocusSessionOptions = {},
): Promise<FocusSessionResult> => {
  const plan = planFocus(agent, options.platform ?? process.platform);
  if (plan.kind === 'unsupported') {
    return { ok: false, reason: plan.reason };
  }

  const runner = options.runner ?? execFileRunner;
  const run = (command: string, args: readonly string[]) =>
    runner(command, args, { timeoutMs: TIMEOUT_MS, signal: undefined });

  /** アプリを前面に出す。`open -a` はシェルを経由しないので名前のエスケープは要らない。 */
  const activate = async (app: string, bundleName: string): Promise<FocusSessionResult> => {
    try {
      await run('open', ['-a', bundleName]);
      return { ok: true, target: 'app', app };
    } catch {
      return { ok: false, reason: `${app} を前面に出せませんでした` };
    }
  };

  if (plan.kind === 'terminal') {
    try {
      await run('osascript', ['-e', buildTerminalScript(plan.command)]);
      return { ok: true, target: 'terminal', app: 'Terminal' };
    } catch {
      // オートメーションを許可していないなど。呼び出し側はコマンドのコピーへ切り替える
      return { ok: false, reason: 'Terminal でセッションを開けませんでした' };
    }
  }

  if (plan.kind === 'app') {
    if (plan.folder !== undefined) {
      try {
        await run('open', ['-a', plan.bundleName, plan.folder]);
        return { ok: true, target: 'app', app: plan.app };
      } catch {
        // フォルダが消えたなど。アプリを出すだけにする
      }
    }
    return activate(plan.app, plan.bundleName);
  }

  const bundleName = appBundleName(plan.app);
  try {
    const ttyPath = toTtyPath(await run('ps', ['-o', 'tty=', '-p', String(plan.pid)]));
    if (ttyPath !== undefined) {
      const found = await run('osascript', ['-e', buildFocusScript(plan.app, ttyPath)]);
      if (found.trim() === FOCUS_SCRIPT_FOUND) {
        return { ok: true, target: 'tab', app: plan.app };
      }
    }
  } catch {
    // プロセスが消えた・オートメーションを許可していないなど。アプリを出すだけにする
  }
  return activate(plan.app, bundleName);
};
