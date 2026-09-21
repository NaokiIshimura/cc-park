import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileRunner, type CommandRunner } from './runCommand.js';

/**
 * Finder から起動した GUI の PATH を補う。
 *
 * Finder 経由で起動したアプリは `/usr/bin:/bin:/usr/sbin:/sbin` しか PATH に持たず、
 * `~/.local/bin` などに入る `claude` を見つけられない。ログインシェルに PATH を
 * 問い合わせて、ターミナルから起動したときと同じ状態に揃える。
 */

/** ログインシェルの出力から PATH を切り出すための目印。 */
const DELIMITER = '__CC_PARK_PATH__';

/** ログインシェルに実行させるコマンド。rc ファイルの出力に紛れないよう目印で挟む。 */
export const SHELL_SCRIPT = `printf '%s' '${DELIMITER}'; printenv PATH; printf '%s' '${DELIMITER}'`;

/** ログインシェルが分からなかったときに使うシェル。 */
const DEFAULT_SHELL = '/bin/zsh';

/** ログインシェルの起動が詰まっても GUI を待たせない上限。 */
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * シェルに聞けなかった場合に補う候補。
 * `claude` の公式インストーラと、よくあるパッケージマネージャの置き場所。
 */
export const HOME_RELATIVE_DIRECTORIES = [
  '.local/bin',
  '.claude/local',
  '.bun/bin',
  '.volta/bin',
  '.npm-global/bin',
  'bin',
] as const;

/** ホーム配下ではない候補。 */
export const ABSOLUTE_DIRECTORIES = ['/opt/homebrew/bin', '/usr/local/bin'] as const;

/** 目印に挟まれた PATH を取り出す。取り出せなければ undefined。 */
export const parseShellPath = (stdout: string): string | undefined => {
  const start = stdout.indexOf(DELIMITER);
  if (start < 0) {
    return undefined;
  }
  const end = stdout.indexOf(DELIMITER, start + DELIMITER.length);
  if (end < 0) {
    return undefined;
  }
  const value = stdout.slice(start + DELIMITER.length, end).trim();
  return value === '' ? undefined : value;
};

/** 空と重複を落として PATH を組み立てる。先に現れた側を優先する。 */
export const mergePaths = (...paths: readonly (string | undefined)[]): string => {
  const seen = new Set<string>();
  for (const path of paths) {
    for (const entry of (path ?? '').split(':')) {
      if (entry !== '') {
        seen.add(entry);
      }
    }
  }
  return [...seen].join(':');
};

export interface ResolveShellPathDeps {
  readonly platform?: NodeJS.Platform;
  /** ログインシェル（既定: 環境変数 SHELL） */
  readonly shell?: string | undefined;
  readonly home?: string;
  /** 現在の PATH（既定: 環境変数 PATH） */
  readonly currentPath?: string | undefined;
  readonly runner?: CommandRunner;
  /** 候補ディレクトリの実在確認。テストから差し替える */
  readonly exists?: (path: string) => boolean;
  readonly timeoutMs?: number;
}

/** 実在する候補ディレクトリだけを集める。 */
const collectFallbacks = (home: string, exists: (path: string) => boolean): string =>
  mergePaths(
    ...HOME_RELATIVE_DIRECTORIES.map((relative) => join(home, relative)),
    ...ABSOLUTE_DIRECTORIES,
  )
    .split(':')
    .filter((directory) => exists(directory))
    .join(':');

/**
 * ログインシェルの PATH を解決する。
 *
 * 失敗しても例外にはせず、候補ディレクトリと現在の PATH で組み立てて返す。
 * PATH が足りないまま起動しても、少なくとも今までどおりには動かすため。
 */
export const resolveShellPath = async (deps: ResolveShellPathDeps = {}): Promise<string> => {
  const platform = deps.platform ?? process.platform;
  const currentPath = deps.currentPath ?? process.env['PATH'];
  if (platform === 'win32') {
    // POSIX シェル前提の手口なので、Windows では何もしない
    return currentPath ?? '';
  }

  const home = deps.home ?? '';
  const exists = deps.exists ?? existsSync;
  const fallbacks = home === '' ? '' : collectFallbacks(home, exists);

  const shell = deps.shell ?? process.env['SHELL'] ?? '';

  let shellPath: string | undefined;
  try {
    const stdout = await (deps.runner ?? execFileRunner)(
      shell === '' ? DEFAULT_SHELL : shell,
      ['-ilc', SHELL_SCRIPT],
      { timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS, signal: undefined },
    );
    shellPath = parseShellPath(stdout);
  } catch {
    // rc ファイルの事情で失敗することがあるため、候補ディレクトリで補って続ける
    shellPath = undefined;
  }

  return mergePaths(shellPath, fallbacks, currentPath);
};
