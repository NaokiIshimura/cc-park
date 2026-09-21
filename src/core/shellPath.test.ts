import { describe, expect, it, vi } from 'vitest';
import type { CommandRunner } from './runCommand.js';
import {
  mergePaths,
  parseShellPath,
  resolveShellPath,
  SHELL_SCRIPT,
  type ResolveShellPathDeps,
} from './shellPath.js';

const DELIMITER = '__CC_PARK_PATH__';

/** 目印で挟んだシェル出力を作る。 */
const shellOutput = (path: string): string => `${DELIMITER}${path}\n${DELIMITER}`;

/** 既定では候補ディレクトリを存在しない扱いにして、対象だけを見る。 */
const deps = (overrides: ResolveShellPathDeps = {}): ResolveShellPathDeps => ({
  platform: 'darwin',
  shell: '/bin/zsh',
  home: '/Users/tester',
  currentPath: '/usr/bin:/bin',
  exists: () => false,
  ...overrides,
});

describe('parseShellPath', () => {
  it('目印に挟まれた PATH を取り出す', () => {
    expect(parseShellPath(shellOutput('/opt/homebrew/bin:/usr/bin'))).toBe(
      '/opt/homebrew/bin:/usr/bin',
    );
  });

  it('rc ファイルの出力が混ざっていても取り出す', () => {
    expect(parseShellPath(`Welcome!\n${shellOutput('/usr/local/bin')}\n`)).toBe('/usr/local/bin');
  });

  it('目印が無ければ undefined', () => {
    expect(parseShellPath('/usr/bin:/bin')).toBeUndefined();
  });

  it('閉じる目印が無ければ undefined', () => {
    expect(parseShellPath(`${DELIMITER}/usr/bin`)).toBeUndefined();
  });

  it('中身が空なら undefined', () => {
    expect(parseShellPath(shellOutput('  '))).toBeUndefined();
  });
});

describe('mergePaths', () => {
  it('先に現れた側を優先して重複を落とす', () => {
    expect(mergePaths('/a:/b', '/b:/c')).toBe('/a:/b:/c');
  });

  it('空要素と undefined を無視する', () => {
    expect(mergePaths(undefined, '/a::/b', '')).toBe('/a:/b');
  });
});

describe('resolveShellPath', () => {
  it('ログインシェルの PATH を現在の PATH より前に置く', async () => {
    const runner: CommandRunner = async () => shellOutput('/Users/tester/.local/bin:/usr/bin');
    expect(await resolveShellPath(deps({ runner }))).toBe('/Users/tester/.local/bin:/usr/bin:/bin');
  });

  it('ログインシェルへ目印付きのコマンドを渡す', async () => {
    const runner = vi.fn<CommandRunner>(async () => shellOutput('/usr/bin'));
    await resolveShellPath(deps({ runner, shell: '/bin/bash' }));
    expect(runner).toHaveBeenCalledWith(
      '/bin/bash',
      ['-ilc', SHELL_SCRIPT],
      expect.objectContaining({ timeoutMs: 3000 }),
    );
  });

  it('ログインシェルの指定が無ければ環境変数 SHELL を使う', async () => {
    vi.stubEnv('SHELL', '/bin/fish');
    const runner = vi.fn<CommandRunner>(async () => shellOutput('/usr/bin'));
    await resolveShellPath(deps({ runner, shell: undefined }));
    expect(runner.mock.calls[0]?.[0]).toBe('/bin/fish');
    vi.unstubAllEnvs();
  });

  it('環境変数 SHELL も無ければ zsh を使う', async () => {
    vi.stubEnv('SHELL', '');
    const runner = vi.fn<CommandRunner>(async () => shellOutput('/usr/bin'));
    await resolveShellPath(deps({ runner, shell: undefined }));
    expect(runner.mock.calls[0]?.[0]).toBe('/bin/zsh');
    vi.unstubAllEnvs();
  });

  it('シェルが失敗しても現在の PATH を返す', async () => {
    const runner: CommandRunner = async () => {
      throw new Error('rc ファイルで停止');
    };
    expect(await resolveShellPath(deps({ runner }))).toBe('/usr/bin:/bin');
  });

  it('シェルが失敗したときは実在する候補ディレクトリで補う', async () => {
    const runner: CommandRunner = async () => {
      throw new Error('boom');
    };
    const exists = (path: string): boolean => path === '/Users/tester/.local/bin';
    expect(await resolveShellPath(deps({ runner, exists }))).toBe(
      '/Users/tester/.local/bin:/usr/bin:/bin',
    );
  });

  it('ホームが分からなければ候補ディレクトリを足さない', async () => {
    const runner: CommandRunner = async () => shellOutput('/usr/bin');
    expect(await resolveShellPath(deps({ runner, home: '', exists: () => true }))).toBe(
      '/usr/bin:/bin',
    );
  });

  it('プラットフォーム指定が無ければ実行中の OS で判断する', async () => {
    const runner: CommandRunner = async () => shellOutput('/usr/bin');
    expect(
      await resolveShellPath({ runner, home: '', currentPath: '/bin', exists: () => false }),
    ).toBe('/usr/bin:/bin');
  });

  it('Windows では現在の PATH をそのまま返し、シェルを呼ばない', async () => {
    const runner = vi.fn<CommandRunner>(async () => shellOutput('/usr/bin'));
    expect(await resolveShellPath(deps({ runner, platform: 'win32' }))).toBe('/usr/bin:/bin');
    expect(runner).not.toHaveBeenCalled();
  });

  it('現在の PATH を渡さなければ環境変数を見る', async () => {
    vi.stubEnv('PATH', '/env/bin');
    const runner: CommandRunner = async () => shellOutput('/usr/bin');
    expect(await resolveShellPath(deps({ runner, currentPath: undefined }))).toBe(
      '/usr/bin:/env/bin',
    );
    vi.unstubAllEnvs();
  });

  it('PATH が無い Windows では空文字を返す', async () => {
    vi.stubEnv('PATH', '');
    expect(await resolveShellPath(deps({ platform: 'win32', currentPath: undefined }))).toBe('');
    vi.unstubAllEnvs();
  });
});
