import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findUnknownInOutput } from './normalizeAgent.js';
import { STORE_DIRECTORY } from './scheduleStore.js';

/**
 * `claude agents --json` の出力を見張り、出力仕様の変化に気づけるようにする。
 *
 * - 解釈できない値（`findUnknownInOutput`）は、値ごとに 1 回だけ知らせる
 * - `--debug` のときは、受け取った出力と未知の値の記録を `~/.cc-park/debug/` に残す
 *
 * 一覧の取得は止めたくないので、書き込みの失敗はすべて握り潰す。
 */

/** `--debug` の記録を置くディレクトリ名（`~/.cc-park/` の下）。 */
export const DEBUG_DIRECTORY = 'debug';
/** 最後に受け取った出力。内容が変わったときだけ書き直す。 */
export const DEBUG_OUTPUT_FILE = 'agents.json';
/** 未知の値の記録。値ごとに 1 行ずつ追記する。 */
export const DEBUG_UNKNOWN_FILE = 'unknown.log';

/** `--debug` の記録の置き場所。 */
export const buildDebugPath = (home: string): string =>
  join(home, STORE_DIRECTORY, DEBUG_DIRECTORY);

export interface DebugFileSystem {
  readonly mkdir: (path: string) => Promise<unknown>;
  readonly writeFile: (path: string, data: string) => Promise<void>;
  readonly appendFile: (path: string, data: string) => Promise<void>;
}

export const fsDebugFileSystem: DebugFileSystem = {
  mkdir: (path) => mkdir(path, { recursive: true }),
  writeFile: (path, data) => writeFile(path, data, 'utf8'),
  appendFile: (path, data) => appendFile(path, data, 'utf8'),
};

/** 取得のたびに呼ぶ。`stdout` は生の出力、`raws` はそれを配列として読んだもの。 */
export type AgentsObserver = (stdout: string, raws: readonly unknown[]) => void;

export interface AgentsObserverOptions {
  /** 未知の値を知らせる先。GUI は main プロセスのログ。CLI は画面が崩れるので渡さない */
  readonly warn?: ((message: string) => void) | undefined;
  /** `--debug` の記録の置き場所。undefined なら記録しない */
  readonly debugDirectory?: string | undefined;
  readonly fs?: DebugFileSystem;
  readonly now?: () => Date;
}

export const createAgentsObserver = (options: AgentsObserverOptions = {}): AgentsObserver => {
  const { warn, debugDirectory } = options;
  const fs = options.fs ?? fsDebugFileSystem;
  const now = options.now ?? (() => new Date());
  const reported = new Set<string>();
  let lastOutput: string | null = null;
  // 書き込みは前のものが終わってから行い、追記の順序が入れ替わらないようにする
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = (task: () => Promise<unknown>): void => {
    queue = queue.then(task).catch(() => undefined);
  };

  return (stdout, raws) => {
    const fresh = findUnknownInOutput(raws).filter((value) => !reported.has(value));
    for (const value of fresh) {
      reported.add(value);
      warn?.(`claude agents --json に解釈できない値があります: ${value}`);
    }

    if (debugDirectory === undefined) {
      return;
    }

    const changed = stdout !== lastOutput;
    lastOutput = stdout;
    if (!changed && fresh.length === 0) {
      return;
    }

    enqueue(async () => {
      await fs.mkdir(debugDirectory);
      if (changed) {
        await fs.writeFile(join(debugDirectory, DEBUG_OUTPUT_FILE), stdout);
      }
      if (fresh.length > 0) {
        const at = now().toISOString();
        await fs.appendFile(
          join(debugDirectory, DEBUG_UNKNOWN_FILE),
          fresh.map((value) => `${at} ${value}\n`).join(''),
        );
      }
    });
  };
};
