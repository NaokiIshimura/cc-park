import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_COMPACT_SETTINGS,
  toCompactSettings,
  type CompactSettings,
} from '../shared/compactSettings.js';
import { DEFAULT_APPEARANCE, toAppearance, type Appearance } from '../shared/themes.js';
import {
  fsScheduleFileSystem,
  STORE_DIRECTORY,
  STORE_VERSION,
  writeAtomically,
  type ScheduleStoreOptions,
} from './scheduleStore.js';

/**
 * GUI の設定（見た目・ミニ表示）の永続化。
 *
 * 予約と同じ `~/.cc-park/` に `settings.json` として置く。読み書きの方針も予約と揃え、
 * 壊れていても例外にせず、解釈できない項目だけ既定値で埋める。
 * 1 つのファイルにまとめて書くため、どれか 1 つを変えるときも全体を保存する。
 */

/** `settings.json` に保存する設定。 */
export interface Settings {
  /** 配色テーマ・強調色・枠線 */
  readonly appearance: Appearance;
  /** ミニ表示の ON / OFF と並び */
  readonly compact: CompactSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: DEFAULT_APPEARANCE,
  compact: DEFAULT_COMPACT_SETTINGS,
};

export const SETTINGS_FILE = 'settings.json';

/** 保存先のパスを組み立てる。 */
export const buildSettingsPath = (home: string): string =>
  join(home, STORE_DIRECTORY, SETTINGS_FILE);

/** ファイルの中身から設定を取り出す。解釈できない項目は既定値にする。 */
export const parseSettings = (text: string): Settings => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return DEFAULT_SETTINGS;
  }

  const { appearance, compact } = parsed as Partial<Record<keyof Settings, unknown>>;
  return { appearance: toAppearance(appearance), compact: toCompactSettings(compact) };
};

/** 保存する JSON 文字列を組み立てる。手で開いても読めるよう字下げする。 */
export const serializeSettings = (settings: Settings): string =>
  `${JSON.stringify({ version: STORE_VERSION, ...settings }, null, 2)}\n`;

/** 設定を読み込む。ファイルが無い・壊れている場合は既定値。 */
export const loadSettings = async (options: ScheduleStoreOptions = {}): Promise<Settings> => {
  const fs = options.fs ?? fsScheduleFileSystem;
  try {
    return parseSettings(await fs.readFile(buildSettingsPath(options.home ?? homedir())));
  } catch {
    // 未作成・権限不足など。既定の設定で起動する
    return DEFAULT_SETTINGS;
  }
};

/** 設定を保存する。書けたかどうかを返す。 */
export const saveSettings = (
  settings: Settings,
  options: ScheduleStoreOptions = {},
): Promise<boolean> =>
  writeAtomically(
    buildSettingsPath(options.home ?? homedir()),
    serializeSettings(settings),
    options.fs ?? fsScheduleFileSystem,
  );
