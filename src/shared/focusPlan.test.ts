import { describe, expect, it } from 'vitest';
import { buildFocusScript, FOCUS_SCRIPT_FOUND, planFocus, toTtyPath } from './focusPlan.js';

const interactive = (
  launchApp: string | undefined,
  pid: number | undefined = 123,
  cwd = '/Users/naoki/app',
) => ({
  kind: 'interactive' as const,
  pid,
  launchApp,
  cwd,
});

const withoutPid = (launchApp: string) => ({
  kind: 'interactive' as const,
  pid: undefined,
  launchApp,
  cwd: '/Users/naoki/app',
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

  it('background セッションは端末を持たないので移動しない', () => {
    expect(
      planFocus(
        { kind: 'background', pid: undefined, launchApp: undefined, cwd: '/Users/naoki/app' },
        'darwin',
      ),
    ).toEqual({
      kind: 'unsupported',
      reason: 'background セッションは端末を持たないため移動できません',
    });
  });

  it('PID が無い interactive セッションは移動しない', () => {
    expect(planFocus(withoutPid('iTerm2'), 'darwin')).toMatchObject({
      kind: 'unsupported',
      reason: 'セッションの PID を取得できないため移動できません',
    });
  });

  it('起動元が分からない・tmux なら移動しない', () => {
    expect(planFocus(interactive(undefined), 'darwin')).toMatchObject({ kind: 'unsupported' });
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
