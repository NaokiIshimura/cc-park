import { describe, expect, it } from 'vitest';
import { appNameFromCommand, parseProcessTable, resolveLaunchApp } from './launchApp.js';

const VSCODE = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const VSCODE_HELPER =
  '/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)';

describe('parseProcessTable', () => {
  it('空白を含む実行ファイルのパスをそのまま読む', () => {
    const table = parseProcessTable(`    1     0 /sbin/launchd\n32227 58295 ${VSCODE_HELPER}\n`);
    expect(table.get(1)).toEqual({ ppid: 0, command: '/sbin/launchd' });
    expect(table.get(32227)).toEqual({ ppid: 58295, command: VSCODE_HELPER });
  });

  it('解析できない行は読み飛ばす', () => {
    expect(parseProcessTable('PID PPID COMM\n\nabc\n').size).toBe(0);
  });
});

describe('appNameFromCommand', () => {
  it.each([
    [VSCODE, 'VS Code'],
    [VSCODE_HELPER, 'VS Code'],
    ['/Applications/iTerm.app/Contents/MacOS/iTerm2', 'iTerm2'],
    ['/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal', 'Terminal'],
    ['/Applications/Cursor.app/Contents/MacOS/Cursor', 'Cursor'],
    ['/Users/me/Library/Application Support/iTerm2/iTermServer-3.7.3', 'iTerm2'],
    ['/opt/homebrew/bin/tmux', 'tmux'],
    ['tmux', 'tmux'],
  ])('%s → %s', (command, expected) => {
    expect(appNameFromCommand(command)).toBe(expected);
  });

  it.each(['/bin/zsh', 'claude', '/sbin/launchd', '/usr/local/bin/tmux-helper'])(
    '%s は起動元アプリではない',
    (command) => {
      expect(appNameFromCommand(command)).toBeUndefined();
    },
  );
});

describe('resolveLaunchApp', () => {
  it('祖先を辿り、最初に見つかったアプリを返す', () => {
    const table = parseProcessTable(
      [
        '33659 32235 claude',
        '32235 32227 /bin/zsh',
        `32227 58295 ${VSCODE_HELPER}`,
        `58295     1 ${VSCODE}`,
        '    1     0 /sbin/launchd',
      ].join('\n'),
    );
    expect(resolveLaunchApp(33659, table)).toBe('VS Code');
  });

  it('アプリより手前に tmux があれば tmux を返す', () => {
    const table = parseProcessTable(
      ['200 100 claude', '100 50 /bin/zsh', '50 1 /opt/homebrew/bin/tmux'].join('\n'),
    );
    expect(resolveLaunchApp(200, table)).toBe('tmux');
  });

  it('launchd まで辿っても見つからなければ undefined', () => {
    const table = parseProcessTable(['200 100 claude', '100 1 /bin/zsh'].join('\n'));
    expect(resolveLaunchApp(200, table)).toBeUndefined();
  });

  it('pid や親が表に無ければ undefined', () => {
    const table = parseProcessTable('200 100 claude');
    expect(resolveLaunchApp(999, table)).toBeUndefined();
    expect(resolveLaunchApp(200, table)).toBeUndefined();
  });

  it('親が循環していても止まる', () => {
    const table = parseProcessTable(
      ['200 100 claude', '100 300 /bin/zsh', '300 100 /bin/sh'].join('\n'),
    );
    expect(resolveLaunchApp(200, table)).toBeUndefined();
  });
});
