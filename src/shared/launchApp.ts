/**
 * セッションの起動元アプリの判定。
 *
 * `claude agents --json` には起動元が載らないため、セッションの pid から
 * 親プロセスを辿り、祖先にいる `.app` やターミナル多重化ツールで見分ける。
 * `ps` の実行は core 側に持たせ、ここには出力の解析と判定だけを置く。
 */

/** `ps` の 1 行ぶん。 */
export interface ProcessEntry {
  readonly ppid: number;
  /** 実行ファイルのパス。macOS の `comm` はフルパスで、空白を含みうる */
  readonly command: string;
}

/** pid → プロセス情報 */
export type ProcessTable = ReadonlyMap<number, ProcessEntry>;

/** `ps` に渡す引数。全プロセスの pid / ppid / 実行ファイルを 1 回で取る */
export const PROCESS_TABLE_ARGS: readonly string[] = ['-axo', 'pid=,ppid=,comm='];

/** 親を辿る上限。循環や異常に深い木で止まらなくならないようにする */
const MAX_DEPTH = 64;

/** `.app` 名と表示名が食い違うアプリの別名。 */
const APP_ALIASES: Readonly<Record<string, string>> = {
  'Visual Studio Code': 'VS Code',
  iTerm: 'iTerm2',
};

/**
 * 表示名から `.app` の名前（`open -a` に渡す名前）へ戻す。
 * 別名を付けていないアプリは表示名が `.app` の名前そのもの。
 */
export const appBundleName = (displayName: string): string =>
  Object.entries(APP_ALIASES).find(([, alias]) => alias === displayName)?.[0] ?? displayName;

/** `ps -axo pid=,ppid=,comm=` の出力を解析する。解析できない行は読み飛ばす。 */
export const parseProcessTable = (stdout: string): ProcessTable => {
  const table = new Map<number, ProcessEntry>();
  for (const line of stdout.split('\n')) {
    const matched = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (matched === null) {
      continue;
    }
    table.set(Number(matched[1]), { ppid: Number(matched[2]), command: matched[3] ?? '' });
  }
  return table;
};

/**
 * 1 つのプロセスが起動元アプリと言えるなら、その表示名を返す。
 *
 * `.app` は最も外側を採る。VS Code の端末は `Code Helper (Plugin).app` の下で動くが、
 * そのパスは `Visual Studio Code.app` の中にあるため。
 */
export const appNameFromCommand = (command: string): string | undefined => {
  const app = /([^/]+)\.app\//.exec(command)?.[1];
  if (app !== undefined) {
    return APP_ALIASES[app] ?? app;
  }
  // iTerm2 を再起動すると、端末を抱えたサーバだけが launchd の下に残る
  if (/\/iTermServer[^/]*$/.test(command)) {
    return APP_ALIASES.iTerm;
  }
  // tmux サーバは launchd の下にいるので、その先のターミナルは辿れない
  if (/(^|\/)tmux$/.test(command)) {
    return 'tmux';
  }
  return undefined;
};

/** 起動元アプリと、そのアプリのプロセス。 */
export interface LaunchAppProcess {
  /** 表示名（`iTerm2` / `Ghostty` / `tmux` など） */
  readonly app: string;
  /** 起動元と判定した祖先プロセスの pid。同じアプリが複数起動していても、どれかを特定できる */
  readonly pid: number;
}

/** pid の祖先を辿り、最初に判定できた起動元アプリとそのプロセスを返す。 */
export const resolveLaunchAppProcess = (
  pid: number,
  table: ProcessTable,
): LaunchAppProcess | undefined => {
  let current = table.get(pid)?.ppid;
  for (let depth = 0; depth < MAX_DEPTH && current !== undefined && current > 1; depth += 1) {
    const entry = table.get(current);
    if (entry === undefined) {
      return undefined;
    }
    const name = appNameFromCommand(entry.command);
    if (name !== undefined) {
      return { app: name, pid: current };
    }
    current = entry.ppid;
  }
  return undefined;
};

/** pid の祖先を辿り、最初に判定できた起動元アプリを返す。 */
export const resolveLaunchApp = (pid: number, table: ProcessTable): string | undefined =>
  resolveLaunchAppProcess(pid, table)?.app;
