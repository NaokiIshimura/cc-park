import { appBundleName } from './launchApp.js';
import { buildResumeCommand } from './resumeCommand.js';
import type { Agent } from '../types/agent.js';

/**
 * セッションの画面（端末のタブ・アプリ）へ移動する方法の判断。
 *
 * 外部コマンドの実行は core 側（`focusSession`）に持たせ、ここには
 * 「どの方法で移動するか」と AppleScript の組み立てだけを置く。
 */

/** タブまで選べる端末アプリ。AppleScript でセッションの tty を引ける。 */
export type TabApp = 'iTerm2' | 'Terminal';

export type FocusPlan =
  /** 端末のタブを tty で探して選び、アプリを前面に出す */
  | { readonly kind: 'tab'; readonly app: TabApp; readonly pid: number }
  /**
   * アプリを前面に出す（VS Code の統合ターミナルなど、タブまでは選べない）。
   * `folder` があれば `open -a <app> <folder>` で、そのフォルダを開いているウィンドウを前面に出す
   */
  | {
      readonly kind: 'app';
      readonly app: string;
      readonly bundleName: string;
      readonly folder?: string;
    }
  /**
   * 起動元の画面が無い・分からない background セッションを、Terminal.app の新しいウィンドウで
   * `claude attach` して開く。`command` は {@link buildResumeCommand} の結果（`cd … && claude attach <id>`）
   */
  | { readonly kind: 'terminal'; readonly command: string }
  /** 移動できない。呼び出し側はコマンドのコピーへ切り替える */
  | { readonly kind: 'unsupported'; readonly reason: string };

const TAB_APPS: readonly string[] = ['iTerm2', 'Terminal'] satisfies readonly TabApp[];

const isTabApp = (app: string): app is TabApp => TAB_APPS.includes(app);

/**
 * フォルダを渡すと、そのフォルダを開いているウィンドウを前面に出すエディタ（VS Code 系）。
 *
 * `open -a` でアプリを出すだけだと、macOS はそのアプリの直前のウィンドウを出す。
 * 別の Space にもウィンドウがあると、セッションのウィンドウがある Space へ切り替わらない。
 * フォルダを渡せばエディタ自身がそのウィンドウを選ぶので、Space も切り替わる。
 */
const FOLDER_EDITORS: readonly string[] = [
  'VS Code',
  'Visual Studio Code - Insiders',
  'VSCodium',
  'Cursor',
  'Windsurf',
];

/** AppleScript の文字列へそのまま埋め込める短縮 ID の形。 */
const ATTACH_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** AppleScript の文字列を壊す制御文字（改行など）。 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Terminal.app で `claude attach` して開ける background セッションなら、その手順を返す。
 *
 * interactive セッションは対象にしない。起動元の端末でまだ動いているため、
 * 別の端末で `claude --resume` すると同じ会話が二重に動いてしまう。
 */
const planTerminal = (
  agent: Pick<Agent, 'kind' | 'id' | 'sessionId' | 'cwd'>,
): FocusPlan | undefined => {
  if (agent.kind !== 'background' || agent.id === undefined || !ATTACH_ID_PATTERN.test(agent.id)) {
    return undefined;
  }
  if (CONTROL_CHARS.test(agent.cwd)) {
    return undefined;
  }
  return { kind: 'terminal', command: buildResumeCommand(agent) };
};

/** 移動の方法を決める。 */
export const planFocus = (
  agent: Pick<Agent, 'kind' | 'pid' | 'launchApp' | 'cwd' | 'id' | 'sessionId'>,
  platform: string,
): FocusPlan => {
  if (platform !== 'darwin') {
    return { kind: 'unsupported', reason: 'セッションへの移動は macOS のみ対応しています' };
  }
  if (agent.pid === undefined || agent.pid <= 0) {
    return (
      planTerminal(agent) ?? {
        kind: 'unsupported',
        reason:
          agent.kind === 'background'
            ? 'background セッションは端末を持たないため移動できません'
            : 'セッションの PID を取得できないため移動できません',
      }
    );
  }
  const app = agent.launchApp;
  if (app === undefined) {
    return (
      planTerminal(agent) ?? {
        kind: 'unsupported',
        reason: '起動元のアプリを判定できないため移動できません',
      }
    );
  }
  if (app === 'tmux') {
    // tmux サーバの先にいるターミナルアプリまでは辿れない
    return { kind: 'unsupported', reason: 'tmux のセッションへは移動できません' };
  }
  if (isTabApp(app)) {
    return { kind: 'tab', app, pid: agent.pid };
  }
  const bundleName = appBundleName(app);
  if (FOLDER_EDITORS.includes(app) && agent.cwd.startsWith('/')) {
    return { kind: 'app', app, bundleName, folder: agent.cwd };
  }
  return { kind: 'app', app, bundleName };
};

/**
 * `ps -o tty=` の出力を端末デバイスのパスにする。
 * 端末を持たない（`??`）・解釈できない場合は undefined。
 *
 * AppleScript へ埋め込む値なので、`ttys003` のような形だけを通す。
 */
export const toTtyPath = (stdout: string): string | undefined => {
  const tty = stdout.trim();
  return /^tty[a-z]*\d+$/.test(tty) ? `/dev/${tty}` : undefined;
};

/** AppleScript が見つけられたときに返す値。 */
export const FOCUS_SCRIPT_FOUND = 'found';

/**
 * tty が一致するタブを選んで前面に出す AppleScript を組み立てる。
 * 見つかれば {@link FOCUS_SCRIPT_FOUND} を返し、見つからなければ空文字を返す。
 *
 * `ttyPath` は {@link toTtyPath} を通した値だけを渡すこと（引用符を含まないことをそこで保証する）。
 *
 * 先にアプリを `activate` してから、ウィンドウを選ぶ。逆の順だと、前面にないアプリの
 * ウィンドウを選んでも Space は切り替わらず、`activate` はアプリの直前のウィンドウを出すだけになる。
 * アプリが前面にいる状態でウィンドウを選べば、macOS がそのウィンドウのある Space へ切り替える。
 */
export const buildFocusScript = (app: TabApp, ttyPath: string): string => {
  if (app === 'iTerm2') {
    return [
      'tell application "iTerm"',
      '  repeat with w in windows',
      '    repeat with t in tabs of w',
      '      repeat with s in sessions of t',
      `        if tty of s is "${ttyPath}" then`,
      '          activate',
      '          tell w to select',
      '          tell t to select',
      '          tell s to select',
      `          return "${FOCUS_SCRIPT_FOUND}"`,
      '        end if',
      '      end repeat',
      '    end repeat',
      '  end repeat',
      'end tell',
      'return ""',
    ].join('\n');
  }
  return [
    'tell application "Terminal"',
    '  repeat with w in windows',
    '    repeat with t in tabs of w',
    `      if tty of t is "${ttyPath}" then`,
    '        activate',
    '        set selected of t to true',
    '        set index of w to 1',
    `        return "${FOCUS_SCRIPT_FOUND}"`,
    '      end if',
    '    end repeat',
    '  end repeat',
    'end tell',
    'return ""',
  ].join('\n');
};

/**
 * Terminal.app の新しいウィンドウでコマンドを実行する AppleScript を組み立てる。
 *
 * 起動していない Terminal に `do script` すると、起動時の空のウィンドウと実行用のウィンドウの
 * 2 つが開く。起動していなければ先に起動し、その最初のウィンドウで実行する。
 *
 * `command` は {@link planFocus} の `terminal` が返した値だけを渡すこと（制御文字を含まないことをそこで保証する）。
 */
export const buildTerminalScript = (command: string): string => {
  const quoted = `"${command.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  return [
    'if application "Terminal" is running then',
    '  tell application "Terminal"',
    `    do script ${quoted}`,
    '    activate',
    '  end tell',
    'else',
    '  tell application "Terminal"',
    '    activate',
    `    do script ${quoted} in window 1`,
    '  end tell',
    'end if',
  ].join('\n');
};
