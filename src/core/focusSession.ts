import {
  ATTACH_CLIENT_ARGS,
  buildActivateProcessScript,
  buildFocusScript,
  buildTerminalOpenArgs,
  buildTerminalScript,
  findAttachClient,
  isScriptTerminal,
  isTabApp,
  FOCUS_SCRIPT_FOUND,
  planFocus,
  toTtyPath,
} from '../shared/focusPlan.js';
import {
  appBundleName,
  parseProcessTable,
  PROCESS_TABLE_ARGS,
  resolveLaunchAppProcess,
} from '../shared/launchApp.js';
import { DEFAULT_OPEN_SETTINGS, type FallbackApp } from '../shared/openSettings.js';
import type { Agent } from '../types/agent.js';
import { execFileRunner, type CommandRunner } from './runCommand.js';

/**
 * セッションの画面（端末のタブ・アプリ）を前面に出す。
 *
 * iTerm2 / Terminal はセッションの tty でタブを探して選ぶ。それ以外のアプリと、
 * タブが見つからない・AppleScript を実行できない（オートメーションの許可が無いなど）場合は、
 * アプリを前面に出すだけにとどめる。失敗は例外ではなく Result 型で返し、UI を落とさない。
 *
 * 起動元の分からない background セッションは、設定で選んだ端末アプリの新しいウィンドウで
 * `claude attach` して開く。既にどこかの端末で attach していれば、新しく開かずにその端末へ移る
 * （開くたびにウィンドウが増えないように）。
 */

export type FocusSessionResult =
  /**
   * `tab` はタブまで選べた、`app` はアプリを前面に出しただけ、
   * `terminal` は background セッションを端末アプリ（設定で選んだもの）の新しいウィンドウで開いた
   */
  | { readonly ok: true; readonly target: 'tab' | 'app' | 'terminal'; readonly app: string }
  | { readonly ok: false; readonly reason: string };

export interface FocusSessionOptions {
  readonly platform?: string;
  /** 起動元のアプリが分からない background セッションを開くアプリ。既定は Terminal */
  readonly fallbackApp?: FallbackApp;
  /** ログインシェル。AppleScript を持たない端末アプリで claude を実行するのに使う。既定は `$SHELL` */
  readonly shell?: string | undefined;
  readonly runner?: CommandRunner;
}

const TIMEOUT_MS = 5000;

export const focusSession = async (
  agent: Agent,
  options: FocusSessionOptions = {},
): Promise<FocusSessionResult> => {
  const plan = planFocus(
    agent,
    options.platform ?? process.platform,
    options.fallbackApp ?? DEFAULT_OPEN_SETTINGS.fallbackApp,
  );
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

  /**
   * 既にどこかの端末で `claude attach <id>` していれば、その端末を前面に出す。
   * 見つからない・前面に出せなければ undefined（呼び出し側が新しく開く）。
   */
  const focusAttachClient = async (id: string): Promise<FocusSessionResult | undefined> => {
    try {
      const client = findAttachClient(await run('ps', ATTACH_CLIENT_ARGS), id);
      if (client === undefined) {
        return undefined;
      }
      const owner = resolveLaunchAppProcess(
        client.pid,
        parseProcessTable(await run('ps', PROCESS_TABLE_ARGS)),
      );
      // tmux の先にある端末は辿れない。新しく開く
      if (owner === undefined || owner.app === 'tmux') {
        return undefined;
      }

      // iTerm2 / Terminal は、1 つのアプリに複数のウィンドウ・タブがあるので tty で選ぶ
      const ttyPath = toTtyPath(client.tty);
      if (isTabApp(owner.app) && ttyPath !== undefined) {
        try {
          const found = await run('osascript', ['-e', buildFocusScript(owner.app, ttyPath)]);
          if (found.trim() === FOCUS_SCRIPT_FOUND) {
            return { ok: true, target: 'tab', app: owner.app };
          }
        } catch {
          // オートメーションの許可が無いなど。アプリを前面に出すだけにする
        }
      }

      // Ghostty などは開くたびに新しく起動しているので、そのウィンドウを持つプロセスを前面に出す
      try {
        await run('osascript', ['-e', buildActivateProcessScript(owner.pid)]);
        return { ok: true, target: 'app', app: owner.app };
      } catch {
        // System Events の操作を許可していないなど。アプリを前面に出すだけにする
      }
      const activated = await activate(owner.app, appBundleName(owner.app));
      return activated.ok ? activated : undefined;
    } catch {
      // ps が失敗したなど。新しく開く
      return undefined;
    }
  };

  if (plan.kind === 'terminal') {
    const existing = await focusAttachClient(plan.id);
    if (existing !== undefined) {
      return existing;
    }
    try {
      if (isScriptTerminal(plan.app)) {
        await run('osascript', ['-e', buildTerminalScript(plan.app, plan.command)]);
      } else {
        // open はシェルを経由しないので、引数のエスケープは要らない
        const shell = 'shell' in options ? options.shell : process.env['SHELL'];
        await run('open', buildTerminalOpenArgs(plan.app, plan.command, shell));
      }
      return { ok: true, target: 'terminal', app: plan.app };
    } catch {
      // オートメーションを許可していない・アプリが入っていないなど。呼び出し側はコマンドのコピーへ切り替える
      return { ok: false, reason: `${plan.app} でセッションを開けませんでした` };
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
