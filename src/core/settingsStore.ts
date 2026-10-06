import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_APPEARANCE, toAppearance, type Appearance } from '../shared/themes.js';
import {
  fsScheduleFileSystem,
  STORE_DIRECTORY,
  STORE_VERSION,
  writeAtomically,
  type ScheduleStoreOptions,
} from './scheduleStore.js';

/**
 * GUI の見た目の設定（配色テーマ・強調色）の永続化。
 *
 * 予約と同じ `~/.cc-park/` に `settings.json` として置く。読み書きの方針も予約と揃え、
 * 壊れていても例外にせず、解釈できない項目だけ既定値で埋める。
 */

export const SETTINGS_FILE = 'settings.json';

/** 保存先のパスを組み立てる。 */
export const buildSettingsPath = (home: string): string =>
  join(home, STORE_DIRECTORY, SETTINGS_FILE);

/** ファイルの中身から見た目の設定を取り出す。解釈できない項目は既定値にする。 */
export const parseAppearance = (text: string): Appearance => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return DEFAULT_APPEARANCE;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return DEFAULT_APPEARANCE;
  }

  return toAppearance((parsed as { readonly appearance?: unknown }).appearance);
};

/** 保存する JSON 文字列を組み立てる。手で開いても読めるよう字下げする。 */
export const serializeAppearance = (appearance: Appearance): string =>
  `${JSON.stringify({ version: STORE_VERSION, appearance }, null, 2)}\n`;

/** 見た目の設定を読み込む。ファイルが無い・壊れている場合は既定値。 */
export const loadAppearance = async (
  options: ScheduleStoreOptions = {},
): Promise<Appearance> => {
  const fs = options.fs ?? fsScheduleFileSystem;
  try {
    return parseAppearance(await fs.readFile(buildSettingsPath(options.home ?? homedir())));
  } catch {
    // 未作成・権限不足など。既定の見た目で起動する
    return DEFAULT_APPEARANCE;
  }
};

/** 見た目の設定を保存する。書けたかどうかを返す。 */
export const saveAppearance = (
  appearance: Appearance,
  options: ScheduleStoreOptions = {},
): Promise<boolean> =>
  writeAtomically(
    buildSettingsPath(options.home ?? homedir()),
    serializeAppearance(appearance),
    options.fs ?? fsScheduleFileSystem,
  );
