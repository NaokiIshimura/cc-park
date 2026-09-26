import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Schedule } from '../shared/schedule.js';
import type { ScheduledLaunch } from '../shared/scheduledLaunch.js';

/**
 * 予約の永続化。
 *
 * 保存先は `~/.cc-park/schedules.json`。Electron の userData ではなくホーム直下に置くのは、
 * GUI を経由せず CLI からも同じ予約を読めるようにするため。
 *
 * 読み取りは壊れていても例外にせず、解釈できた予約だけを返す（`gui/config.ts` と同じ考え方）。
 * 手で編集されることも、書き込み中に落ちることもある前提で扱う。
 */

export const STORE_DIRECTORY = '.cc-park';
export const STORE_FILE = 'schedules.json';
/** 予約から起動したセッションの記録。予約とは寿命が違うので別のファイルにする */
export const LAUNCHES_FILE = 'launches.json';

/** 保存形式の版。読み取り側は将来の版でも落ちないよう、値としては見るだけにする。 */
export const STORE_VERSION = 1;

/** 保存先のパスを組み立てる。 */
export const buildStorePath = (home: string): string =>
  join(home, STORE_DIRECTORY, STORE_FILE);

/** 起動の記録の保存先を組み立てる。 */
export const buildLaunchesPath = (home: string): string =>
  join(home, STORE_DIRECTORY, LAUNCHES_FILE);

/** ファイル操作の実装。テストから差し替える。 */
export interface ScheduleFileSystem {
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, data: string) => Promise<void>;
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly mkdir: (path: string) => Promise<void>;
}

export const fsScheduleFileSystem: ScheduleFileSystem = {
  readFile: (path) => readFile(path, 'utf8'),
  writeFile: async (path, data) => {
    await writeFile(path, data, 'utf8');
  },
  rename: async (from, to) => {
    await rename(from, to);
  },
  mkdir: async (path) => {
    await mkdir(path, { recursive: true });
  },
};

export interface ScheduleStoreOptions {
  /** 保存先を探す起点。既定は実行ユーザーのホーム */
  readonly home?: string;
  readonly fs?: ScheduleFileSystem;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

/** 1 件ぶんを検査する。必須項目が欠けていれば null にして捨てる。 */
const toSchedule = (value: unknown): Schedule | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const source = value as Partial<Record<keyof Schedule, unknown>>;
  if (
    !isNonEmptyString(source.id) ||
    !isNonEmptyString(source.time) ||
    !isNonEmptyString(source.cwd) ||
    !isNonEmptyString(source.prompt)
  ) {
    return null;
  }

  return {
    id: source.id,
    time: source.time,
    cwd: source.cwd,
    prompt: source.prompt,
    // 壊れていたら「動く」側へ倒す。黙って止まっているより気づきやすい
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    lastFiredAt:
      typeof source.lastFiredAt === 'number' && Number.isFinite(source.lastFiredAt)
        ? source.lastFiredAt
        : null,
  };
};

/** 1 件ぶんの起動の記録を検査する。必須項目が欠けていれば null にして捨てる。 */
const toScheduledLaunch = (value: unknown): ScheduledLaunch | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const source = value as Partial<Record<keyof ScheduledLaunch, unknown>>;
  if (
    !isNonEmptyString(source.agentId) ||
    !isNonEmptyString(source.scheduleId) ||
    !isNonEmptyString(source.time) ||
    typeof source.firedAt !== 'number' ||
    !Number.isFinite(source.firedAt)
  ) {
    return null;
  }

  return {
    agentId: source.agentId,
    scheduleId: source.scheduleId,
    time: source.time,
    firedAt: source.firedAt,
  };
};

/** `{ <key>: [...] }` の配列を取り出し、要素ごとに検査する。解釈できない部分は捨てる。 */
const parseList = <T>(text: string, key: string, toItem: (value: unknown) => T | null): T[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return [];
  }

  const list = (parsed as Readonly<Record<string, unknown>>)[key];
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map(toItem).filter((item): item is T => item !== null);
};

/** ファイルの中身から予約の配列を取り出す。解釈できない部分は捨てる。 */
export const parseSchedules = (text: string): Schedule[] =>
  parseList(text, 'schedules', toSchedule);

/** ファイルの中身から起動の記録を取り出す。解釈できない部分は捨てる。 */
export const parseScheduledLaunches = (text: string): ScheduledLaunch[] =>
  parseList(text, 'launches', toScheduledLaunch);

/** 保存する JSON 文字列を組み立てる。手で開いても読めるよう字下げする。 */
export const serializeSchedules = (schedules: readonly Schedule[]): string =>
  `${JSON.stringify({ version: STORE_VERSION, schedules }, null, 2)}\n`;

/** 起動の記録を保存する JSON 文字列を組み立てる。 */
export const serializeScheduledLaunches = (launches: readonly ScheduledLaunch[]): string =>
  `${JSON.stringify({ version: STORE_VERSION, launches }, null, 2)}\n`;

/** ファイルを読んで解釈する。ファイルが無い・読めない場合は空配列。 */
const loadList = async <T>(
  path: string,
  parse: (text: string) => T[],
  fs: ScheduleFileSystem,
): Promise<T[]> => {
  try {
    return parse(await fs.readFile(path));
  } catch {
    // 未作成・権限不足など。空の状態として扱い、起動は止めない
    return [];
  }
};

/**
 * 一時ファイルへ書いてから rename する。書けたかどうかを返す。
 *
 * 発火直後に落ちても、中途半端な JSON が残って次回の起動時に中身を失うことがないようにする。
 */
const writeAtomically = async (
  path: string,
  data: string,
  fs: ScheduleFileSystem,
): Promise<boolean> => {
  const temporary = `${path}.tmp`;

  try {
    await fs.mkdir(dirname(path));
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, path);
    return true;
  } catch {
    return false;
  }
};

/** 予約を読み込む。ファイルが無い・壊れている場合は空配列。 */
export const loadSchedules = (options: ScheduleStoreOptions = {}): Promise<Schedule[]> =>
  loadList(
    buildStorePath(options.home ?? homedir()),
    parseSchedules,
    options.fs ?? fsScheduleFileSystem,
  );

/** 予約を保存する。書けたかどうかを返す。 */
export const saveSchedules = (
  schedules: readonly Schedule[],
  options: ScheduleStoreOptions = {},
): Promise<boolean> =>
  writeAtomically(
    buildStorePath(options.home ?? homedir()),
    serializeSchedules(schedules),
    options.fs ?? fsScheduleFileSystem,
  );

/** 起動の記録を読み込む。ファイルが無い・壊れている場合は空配列。 */
export const loadScheduledLaunches = (
  options: ScheduleStoreOptions = {},
): Promise<ScheduledLaunch[]> =>
  loadList(
    buildLaunchesPath(options.home ?? homedir()),
    parseScheduledLaunches,
    options.fs ?? fsScheduleFileSystem,
  );

/** 起動の記録を保存する。書けたかどうかを返す。 */
export const saveScheduledLaunches = (
  launches: readonly ScheduledLaunch[],
  options: ScheduleStoreOptions = {},
): Promise<boolean> =>
  writeAtomically(
    buildLaunchesPath(options.home ?? homedir()),
    serializeScheduledLaunches(launches),
    options.fs ?? fsScheduleFileSystem,
  );
