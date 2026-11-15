import { describe, expect, it } from 'vitest';
import {
  buildFocusScript,
  buildTerminalScript,
  FOCUS_SCRIPT_FOUND,
  planFocus,
  toTtyPath,
} from './focusPlan.js';

const interactive = (
  launchApp: string | undefined,
  pid: number | undefined = 123,
  cwd = '/Users/naoki/app',
) => ({
  kind: 'interactive' as const,
  pid,
  launchApp,
  cwd,
  sessionId: 's1',
  id: undefined,
});

/** `claude --bg` で起動した background セッション。既定は PID も起動元も無い。 */
const background = (
  overrides: { pid?: number; launchApp?: string; id?: string | undefined; cwd?: string } = {},
) => ({
  kind: 'background' as const,
  pid: overrides.pid,
  launchApp: overrides.launchApp,
  cwd: overrides.cwd ?? '/Users/naoki/GitHub/cc-park',
  sessionId: 's1',
  id: 'id' in overrides ? overrides.id : '5c2d4962',
});

const withoutPid = (launchApp: string) => ({
  kind: 'interactive' as const,
  pid: undefined,
  launchApp,
  cwd: '/Users/naoki/app',
  sessionId: 's1',
  id: undefined,
});

describe('planFocus', () => {
  it('iTerm2 / Terminal はタブまで選ぶ', () => {
    expect(planFocus(interactive('iTerm2'), 'darwin')).toEqual({
      kind: 'tab',
      app: 'iTerm2',
      pid: 123,
    });
    expect(planFocus(interactive('Terminal'), 'darwin')).toMatchObject({
      kind: 'tab',
      app: 'Terminal',
    });
  });

  it('VS Code 系のエディタは、セッションのフォルダを開いているウィンドウを前面に出す', () => {
    expect(planFocus(interactive('VS Code'), 'darwin')).toEqual({
      kind: 'app',
      app: 'VS Code',
      bundleName: 'Visual Studio Code',
      folder: '/Users/naoki/app',
    });
    expect(planFocus(interactive('Cursor'), 'darwin')).toEqual({
      kind: 'app',
      app: 'Cursor',
      bundleName: 'Cursor',
      folder: '/Users/naoki/app',
    });
  });

  it('フォルダが絶対パスでなければ、エディタもアプリを前面に出すだけにする', () => {
    expect(planFocus(interactive('VS Code', 123, ''), 'darwin')).toEqual({
      kind: 'app',
      app: 'VS Code',
      bundleName: 'Visual Studio Code',
    });
  });

  it('それ以外のアプリは .app の名前で前面に出すだけにする', () => {
    expect(planFocus(interactive('Ghostty'), 'darwin')).toEqual({
      kind: 'app',
      app: 'Ghostty',
      bundleName: 'Ghostty',
    });
  });

  it('macOS 以外では移動しない', () => {
    expect(planFocus(interactive('iTerm2'), 'linux')).toEqual({
      kind: 'unsupported',
      reason: 'セッションへの移動は macOS のみ対応しています',
    });
  });

  it('PID の無い background セッションは Terminal で claude attach して開く', () => {
    expect(planFocus(background(), 'darwin')).toEqual({
      kind: 'terminal',
      app: 'Terminal',
      command: 'cd /Users/naoki/GitHub/cc-park && claude attach 5c2d4962',
    });
  });

  it('起動元が分からない background セッションも Terminal で開く', () => {
    expect(planFocus(background({ pid: 4321 }), 'darwin')).toEqual({
      kind: 'terminal',
      app: 'Terminal',
      command: 'cd /Users/naoki/GitHub/cc-park && claude attach 5c2d4962',
    });
  });

  it('起動元が分かる background セッションは、これまでどおりそのアプリへ移動する', () => {
    expect(planFocus(background({ pid: 4321, launchApp: 'iTerm2' }), 'darwin')).toMatchObject({
      kind: 'tab',
      app: 'iTerm2',
    });
  });

  it('短縮 ID が無い・想定外の形の background セッションは開かない', () => {
    expect(planFocus(background({ id: undefined }), 'darwin')).toEqual({
      kind: 'unsupported',
      reason: 'background セッションは端末を持たないため移動できません',
    });
    expect(planFocus(background({ id: '5c2d" & quit & "' }), 'darwin')).toMatchObject({
      kind: 'unsupported',
    });
  });

  it('ディレクトリに改行などの制御文字があれば開かない', () => {
    expect(planFocus(background({ cwd: '/tmp/a\nb' }), 'darwin')).toMatchObject({
      kind: 'unsupported',
    });
  });

  it('ディレクトリに空白や引用符があっても、シェル向けに囲んだコマンドにする', () => {
    expect(planFocus(background({ cwd: "/Users/naoki/My App's" }), 'darwin')).toEqual({
      kind: 'terminal',
      app: 'Terminal',
      command: "cd '/Users/naoki/My App'\\''s' && claude attach 5c2d4962",
    });
  });

  it('設定で iTerm2 を選んでいれば iTerm2 で開く', () => {
    expect(planFocus(background(), 'darwin', 'iTerm2')).toEqual({
      kind: 'terminal',
      app: 'iTerm2',
      command: 'cd /Users/naoki/GitHub/cc-park && claude attach 5c2d4962',
    });
  });

  it('設定で「開かずにコピー」を選んでいれば開かない（呼び出し側がコピーする）', () => {
    expect(planFocus(background(), 'darwin', 'copy')).toEqual({
      kind: 'unsupported',
      reason: 'background セッションは端末を持たないため移動できません',
    });
    expect(planFocus(background({ pid: 4321 }), 'darwin', 'copy')).toEqual({
      kind: 'unsupported',
      reason: '起動元のアプリを判定できないため移動できません',
    });
  });

  it('設定は起動元が分かるセッションの移動には関わらない', () => {
    expect(planFocus(interactive('iTerm2'), 'darwin', 'copy')).toMatchObject({ kind: 'tab' });
    expect(
      planFocus(background({ pid: 4321, launchApp: 'Terminal' }), 'darwin', 'iTerm2'),
    ).toMatchObject({ kind: 'tab', app: 'Terminal' });
  });

  it('macOS 以外では background セッションも開かない', () => {
    expect(planFocus(background(), 'linux')).toMatchObject({ kind: 'unsupported' });
  });

  it('PID が無い interactive セッションは移動しない', () => {
    expect(planFocus(withoutPid('iTerm2'), 'darwin')).toMatchObject({
      kind: 'unsupported',
      reason: 'セッションの PID を取得できないため移動できません',
    });
  });

  it('起動元が分からない interactive・tmux なら移動しない（resume すると会話が二重に動くため）', () => {
    expect(planFocus(interactive(undefined), 'darwin')).toEqual({
      kind: 'unsupported',
      reason: '起動元のアプリを判定できないため移動できません',
    });
    expect(planFocus(interactive('tmux'), 'darwin')).toEqual({
      kind: 'unsupported',
      reason: 'tmux のセッションへは移動できません',
    });
  });
});

describe('toTtyPath', () => {
  it('ps の tty を端末デバイスのパスにする', () => {
    expect(toTtyPath('ttys003\n')).toBe('/dev/ttys003');
    expect(toTtyPath('  ttys012  ')).toBe('/dev/ttys012');
  });

  it('端末を持たない・想定外の形なら undefined', () => {
    expect(toTtyPath('??')).toBeUndefined();
    expect(toTtyPath('')).toBeUndefined();
    expect(toTtyPath('ttys003" then do shell script "rm')).toBeUndefined();
  });
});

describe('buildFocusScript', () => {
  it('iTerm2 はセッションの tty で探し、ウィンドウ・タブ・セッションを選ぶ', () => {
    const script = buildFocusScript('iTerm2', '/dev/ttys003');
    expect(script).toContain('tell application "iTerm"');
    expect(script).toContain('if tty of s is "/dev/ttys003" then');
    expect(script).toContain('tell s to select');
    expect(script).toContain(`return "${FOCUS_SCRIPT_FOUND}"`);
  });

  it('Terminal はタブの tty で探し、タブとウィンドウを前に出す', () => {
    const script = buildFocusScript('Terminal', '/dev/ttys004');
    expect(script).toContain('tell application "Terminal"');
    expect(script).toContain('if tty of t is "/dev/ttys004" then');
    expect(script).toContain('set selected of t to true');
    expect(script).toContain('set index of w to 1');
  });

  it.each(['iTerm2', 'Terminal'] as const)(
    '%s は先にアプリを activate してからウィンドウを選ぶ（別の Space へ切り替えるため）',
    (app) => {
      const lines = buildFocusScript(app, '/dev/ttys003')
        .split('\n')
        .map((line) => line.trim());
      const activateAt = lines.indexOf('activate');
      const selectAt = lines.findIndex(
        (line) => line === 'tell w to select' || line === 'set index of w to 1',
      );
      expect(activateAt).toBeGreaterThan(-1);
      expect(selectAt).toBeGreaterThan(activateAt);
    },
  );

  it('見つからなければ空文字を返す', () => {
    expect(buildFocusScript('Terminal', '/dev/ttys004').endsWith('return ""')).toBe(true);
  });
});

describe('buildTerminalScript', () => {
  it('iTerm2 は新しいウィンドウを作り、そのセッションにコマンドを打ち込む', () => {
    const script = buildTerminalScript('iTerm2', 'cd /tmp && claude attach 5c2d4962');
    expect(script).toContain('tell application "iTerm"');
    expect(script).toContain('set newWindow to (create window with default profile)');
    expect(script).toContain(
      'tell current session of newWindow to write text "cd /tmp && claude attach 5c2d4962"',
    );
  });

  it('iTerm2 が起動していなければ、起動時に開くウィンドウで実行する（無ければ作る）', () => {
    const script = buildTerminalScript('iTerm2', 'claude attach 5c2d4962');
    expect(script).toContain('if application "iTerm" is running then');
    expect(script).toContain('if (count of windows) is 0 then create window with default profile');
    expect(script).toContain(
      'tell current session of current window to write text "claude attach 5c2d4962"',
    );
  });

  it('iTerm2 でも引用符とバックスラッシュをエスケープする', () => {
    expect(buildTerminalScript('iTerm2', 'a"b\\c')).toContain('write text "a\\"b\\\\c"');
  });

  it('Terminal の新しいウィンドウでコマンドを実行して前面に出す', () => {
    const script = buildTerminalScript('Terminal', 'cd /tmp && claude attach 5c2d4962');
    expect(script).toContain('tell application "Terminal"');
    expect(script).toContain('do script "cd /tmp && claude attach 5c2d4962"');
    expect(script).toContain('activate');
  });

  it('起動していなければ、起動時に開く最初のウィンドウで実行する（ウィンドウを 2 つ開かない）', () => {
    const script = buildTerminalScript('Terminal', 'claude attach 5c2d4962');
    expect(script).toContain('if application "Terminal" is running then');
    expect(script).toContain('do script "claude attach 5c2d4962" in window 1');
  });

  it('AppleScript の文字列を壊す引用符とバックスラッシュをエスケープする', () => {
    const script = buildTerminalScript('Terminal', "cd '/tmp/a\"b\\c' && claude attach 5c2d4962");
    expect(script).toContain('do script "cd \'/tmp/a\\"b\\\\c\' && claude attach 5c2d4962"');
  });
});
