import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '../types/agent.js';
import { focusSession } from './focusSession.js';
import type { CommandRunner } from './runCommand.js';

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  sessionId: 's1',
  name: 'app',
  cwd: '/Users/naoki/app',
  kind: 'interactive',
  startedAt: 0,
  state: 'blocked',
  rawState: 'busy',
  pid: 123,
  id: undefined,
  meta: undefined,
  launchApp: 'iTerm2',
  ...overrides,
});

/** コマンド名ごとに応答（または例外）を決めるランナー。 */
const fakeRunner = (responses: Record<string, string | Error>) =>
  vi.fn<CommandRunner>(async (command) => {
    const response = responses[command];
    if (response === undefined || response instanceof Error) {
      throw response ?? new Error(`unexpected: ${command}`);
    }
    return response;
  });

describe('focusSession', () => {
  it('iTerm2 は tty でタブを探して選ぶ', async () => {
    const runner = fakeRunner({ ps: 'ttys003\n', osascript: 'found\n' });
    await expect(focusSession(agent(), { platform: 'darwin', runner })).resolves.toEqual({
      ok: true,
      target: 'tab',
      app: 'iTerm2',
    });
    expect(runner.mock.calls[0]?.slice(0, 2)).toEqual(['ps', ['-o', 'tty=', '-p', '123']]);
    expect(runner.mock.calls[1]?.[1]?.[1]).toContain('"/dev/ttys003"');
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('タブが見つからなければアプリを前面に出すだけにする', async () => {
    const runner = fakeRunner({ ps: 'ttys003', osascript: '\n', open: '' });
    await expect(focusSession(agent(), { platform: 'darwin', runner })).resolves.toEqual({
      ok: true,
      target: 'app',
      app: 'iTerm2',
    });
    expect(runner).toHaveBeenLastCalledWith('open', ['-a', 'iTerm'], expect.anything());
  });

  it('AppleScript を実行できなくても（許可が無いなど）アプリは前面に出す', async () => {
    const runner = fakeRunner({ ps: 'ttys003', osascript: new Error('-1743'), open: '' });
    await expect(
      focusSession(agent({ launchApp: 'Terminal' }), { platform: 'darwin', runner }),
    ).resolves.toEqual({ ok: true, target: 'app', app: 'Terminal' });
  });

  it('端末を持たないプロセスは AppleScript を使わずアプリを前面に出す', async () => {
    const runner = fakeRunner({ ps: '??', open: '' });
    await expect(focusSession(agent(), { platform: 'darwin', runner })).resolves.toMatchObject({
      target: 'app',
    });
    expect(runner.mock.calls.map(([command]) => command)).toEqual(['ps', 'open']);
  });

  it('VS Code はセッションのフォルダを渡し、そのウィンドウ（の Space）へ移る', async () => {
    const runner = fakeRunner({ open: '' });
    await expect(
      focusSession(agent({ launchApp: 'VS Code' }), { platform: 'darwin', runner }),
    ).resolves.toEqual({ ok: true, target: 'app', app: 'VS Code' });
    expect(runner).toHaveBeenCalledWith(
      'open',
      ['-a', 'Visual Studio Code', '/Users/naoki/app'],
      expect.anything(),
    );
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('フォルダを開けなければ（消えたなど）アプリを前面に出すだけにする', async () => {
    const runner = vi.fn<CommandRunner>(async (_command, args) => {
      if (args.length > 2) {
        throw new Error('does not exist');
      }
      return '';
    });
    await expect(
      focusSession(agent({ launchApp: 'VS Code' }), { platform: 'darwin', runner }),
    ).resolves.toEqual({ ok: true, target: 'app', app: 'VS Code' });
    expect(runner).toHaveBeenLastCalledWith('open', ['-a', 'Visual Studio Code'], expect.anything());
  });

  it('VS Code 系でないアプリは .app の名前で前面に出す', async () => {
    const runner = fakeRunner({ open: '' });
    await expect(
      focusSession(agent({ launchApp: 'Ghostty' }), { platform: 'darwin', runner }),
    ).resolves.toEqual({ ok: true, target: 'app', app: 'Ghostty' });
    expect(runner).toHaveBeenCalledWith('open', ['-a', 'Ghostty'], expect.anything());
  });

  it('アプリも前面に出せなければ失敗を返す', async () => {
    const runner = fakeRunner({ open: new Error('not found') });
    await expect(
      focusSession(agent({ launchApp: 'Cursor' }), { platform: 'darwin', runner }),
    ).resolves.toEqual({ ok: false, reason: 'Cursor を前面に出せませんでした' });
  });

  it('起動元の分からない background セッションは Terminal で claude attach して開く', async () => {
    const runner = fakeRunner({ ps: '', osascript: '' });
    await expect(
      focusSession(
        agent({ kind: 'background', id: '5c2d4962', pid: undefined, launchApp: undefined }),
        {
          platform: 'darwin',
          runner,
        },
      ),
    ).resolves.toEqual({ ok: true, target: 'terminal', app: 'Terminal' });
    // まだどこでも attach していないことを確かめてから開く
    expect(runner.mock.calls.map(([command]) => command)).toEqual(['ps', 'osascript']);
    expect(runner.mock.calls[1]?.[1]?.[1]).toContain(
      'do script "cd /Users/naoki/app && claude attach 5c2d4962"',
    );
  });

  it('Terminal で開けなければ（オートメーションの許可が無いなど）失敗を返す', async () => {
    const runner = fakeRunner({ osascript: new Error('-1743') });
    await expect(
      focusSession(
        agent({ kind: 'background', id: '5c2d4962', pid: undefined, launchApp: undefined }),
        {
          platform: 'darwin',
          runner,
        },
      ),
    ).resolves.toEqual({ ok: false, reason: 'Terminal でセッションを開けませんでした' });
  });

  it('設定で選んだ iTerm2 で開く', async () => {
    const runner = fakeRunner({ ps: '', osascript: '' });
    await expect(
      focusSession(
        agent({ kind: 'background', id: '5c2d4962', pid: undefined, launchApp: undefined }),
        { platform: 'darwin', runner, fallbackApp: 'iTerm2' },
      ),
    ).resolves.toEqual({ ok: true, target: 'terminal', app: 'iTerm2' });
    expect(runner.mock.calls[1]?.[1]?.[1]).toContain('tell application "iTerm"');
  });

  it('iTerm2 で開けなければ、iTerm2 で開けなかったと返す', async () => {
    const runner = fakeRunner({ osascript: new Error('not found') });
    await expect(
      focusSession(
        agent({ kind: 'background', id: '5c2d4962', pid: undefined, launchApp: undefined }),
        { platform: 'darwin', runner, fallbackApp: 'iTerm2' },
      ),
    ).resolves.toEqual({ ok: false, reason: 'iTerm2 でセッションを開けませんでした' });
  });

  it('Ghostty などは open -na の引数で、ログインシェルを通して開く', async () => {
    const runner = fakeRunner({ open: '' });
    await expect(
      focusSession(
        agent({ kind: 'background', id: '5c2d4962', pid: undefined, launchApp: undefined }),
        { platform: 'darwin', runner, fallbackApp: 'Ghostty', shell: '/bin/zsh' },
      ),
    ).resolves.toEqual({ ok: true, target: 'terminal', app: 'Ghostty' });
    expect(runner).toHaveBeenCalledWith(
      'open',
      [
        '-na',
        'Ghostty',
        '--args',
        '-e',
        '/bin/zsh',
        '-l',
        '-c',
        'cd /Users/naoki/app && claude attach 5c2d4962; exec /bin/zsh -l',
      ],
      expect.anything(),
    );
  });

  it('アプリが入っていないなどで開けなければ、開けなかったと返す', async () => {
    const runner = fakeRunner({ open: new Error('Unable to find application named kitty') });
    await expect(
      focusSession(
        agent({ kind: 'background', id: '5c2d4962', pid: undefined, launchApp: undefined }),
        { platform: 'darwin', runner, fallbackApp: 'kitty' },
      ),
    ).resolves.toEqual({ ok: false, reason: 'kitty でセッションを開けませんでした' });
  });

  it('設定が「開かずにコピー」ならコマンドを実行せずに理由を返す', async () => {
    const runner = fakeRunner({});
    await expect(
      focusSession(
        agent({ kind: 'background', id: '5c2d4962', pid: undefined, launchApp: undefined }),
        { platform: 'darwin', runner, fallbackApp: 'copy' },
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(runner).not.toHaveBeenCalled();
  });

  it('移動できないセッションはコマンドを実行せずに理由を返す', async () => {
    const runner = fakeRunner({});
    await expect(
      focusSession(agent({ launchApp: 'tmux' }), { platform: 'darwin', runner }),
    ).resolves.toEqual({ ok: false, reason: 'tmux のセッションへは移動できません' });
    expect(runner).not.toHaveBeenCalled();
  });

  describe('既に attach しているウィンドウがあるとき', () => {
    const bg = () =>
      agent({ kind: 'background', id: '5c2d4962', pid: undefined, launchApp: undefined });

    /** `ps` を引数で出し分けるランナー。attach の一覧とプロセスの親子を返す。 */
    const attachedRunner = (clients: string, table: string, osascript: string | Error = '') =>
      vi.fn<CommandRunner>(async (command, args) => {
        if (command === 'ps') {
          return args.includes('pid=,tty=,args=') ? clients : table;
        }
        if (command === 'osascript') {
          if (osascript instanceof Error) {
            throw osascript;
          }
          return osascript;
        }
        if (command === 'open') {
          return '';
        }
        throw new Error(`unexpected: ${command}`);
      });

    const commands = (runner: ReturnType<typeof attachedRunner>) =>
      runner.mock.calls.map(([command]) => command);

    it('iTerm2 で attach していれば、新しく開かずにそのタブへ移る', async () => {
      const runner = attachedRunner(
        '  901 ttys003  claude attach 5c2d4962\n  902 ??  /usr/bin/other',
        [
          '  901   900 /Users/naoki/.local/bin/claude',
          '  900   800 -zsh',
          '  800     1 /Applications/iTerm.app/Contents/MacOS/iTerm2',
        ].join('\n'),
        'found',
      );
      await expect(
        focusSession(bg(), { platform: 'darwin', runner, fallbackApp: 'iTerm2' }),
      ).resolves.toEqual({ ok: true, target: 'tab', app: 'iTerm2' });
      expect(runner.mock.calls[2]?.[1]?.[1]).toContain('if tty of s is "/dev/ttys003" then');
      expect(commands(runner)).toEqual(['ps', 'ps', 'osascript']);
    });

    it('Ghostty で attach していれば、そのウィンドウを持つプロセスを前面に出す', async () => {
      const runner = attachedRunner(
        '  950 ttys007  /bin/zsh -l -c cd /Users/naoki/app && claude attach 5c2d4962; exec /bin/zsh -l',
        [
          '  950   720 /bin/zsh',
          '  720   700 /usr/bin/login',
          '  700     1 /Applications/Ghostty.app/Contents/MacOS/ghostty',
        ].join('\n'),
      );
      await expect(
        focusSession(bg(), { platform: 'darwin', runner, fallbackApp: 'Ghostty' }),
      ).resolves.toEqual({ ok: true, target: 'app', app: 'Ghostty' });
      expect(runner.mock.calls[2]?.[1]?.[1]).toContain('first process whose unix id is 700');
      expect(commands(runner)).not.toContain('open');
    });

    it('プロセスを前面に出せなければ（System Events の許可が無いなど）、アプリを前面に出す', async () => {
      const runner = attachedRunner(
        '  950 ttys007  claude attach 5c2d4962',
        ['  950   700 /bin/zsh', '  700     1 /Applications/kitty.app/Contents/MacOS/kitty'].join(
          '\n',
        ),
        new Error('-1743'),
      );
      await expect(
        focusSession(bg(), { platform: 'darwin', runner, fallbackApp: 'kitty' }),
      ).resolves.toEqual({ ok: true, target: 'app', app: 'kitty' });
      expect(runner).toHaveBeenLastCalledWith('open', ['-a', 'kitty'], expect.anything());
    });

    it('別のセッションへの attach や、端末を持たないプロセスは数えず、新しく開く', async () => {
      const runner = attachedRunner(
        ['  901 ttys003  claude attach 5c2d4962aa', '  902 ??  claude attach 5c2d4962'].join('\n'),
        '',
      );
      await expect(
        focusSession(bg(), { platform: 'darwin', runner, fallbackApp: 'Ghostty' }),
      ).resolves.toEqual({ ok: true, target: 'terminal', app: 'Ghostty' });
      expect(commands(runner)).toEqual(['ps', 'open']);
    });

    it('tmux の中で attach しているときは、辿れないので新しく開く', async () => {
      const runner = attachedRunner(
        '  901 ttys003  claude attach 5c2d4962',
        ['  901   600 -zsh', '  600     1 /opt/homebrew/bin/tmux'].join('\n'),
      );
      await expect(focusSession(bg(), { platform: 'darwin', runner })).resolves.toEqual({
        ok: true,
        target: 'terminal',
        app: 'Terminal',
      });
    });
  });
});
