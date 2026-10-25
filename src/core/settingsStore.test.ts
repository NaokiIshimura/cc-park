import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_COMPACT_SETTINGS } from '../shared/compactSettings.js';
import type { ScheduleFileSystem } from './scheduleStore.js';
import {
  buildSettingsPath,
  DEFAULT_SETTINGS,
  loadSettings,
  parseSettings,
  saveSettings,
  serializeSettings,
  type Settings,
} from './settingsStore.js';

const settings: Settings = {
  appearance: { theme: 'navy', accent: '#f59e0b', frame: false },
  compact: { mode: 'on', layout: 'horizontal' },
};

/** 書き込みが必ず失敗するファイルシステム。 */
const failingFs: ScheduleFileSystem = {
  readFile: async () => {
    throw new Error('EACCES');
  },
  writeFile: async () => {
    throw new Error('EACCES');
  },
  rename: async () => undefined,
  mkdir: async () => undefined,
};

describe('buildSettingsPath', () => {
  it('予約と同じ .cc-park に置く', () => {
    expect(buildSettingsPath('/Users/naoki')).toBe('/Users/naoki/.cc-park/settings.json');
  });
});

describe('parseSettings', () => {
  it('serializeSettings の出力を復元できる', () => {
    expect(parseSettings(serializeSettings(settings))).toEqual(settings);
  });

  it('JSON として壊れていれば既定値を返す', () => {
    expect(parseSettings('{')).toEqual(DEFAULT_SETTINGS);
  });

  it('オブジェクト以外なら既定値を返す', () => {
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
  });

  it('項目が無ければ既定値を返す', () => {
    expect(parseSettings(JSON.stringify({ version: 1 }))).toEqual(DEFAULT_SETTINGS);
  });

  it('ミニ表示の設定を持たない古いファイルは、見た目だけ読んでミニ表示は既定にする', () => {
    const text = JSON.stringify({ version: 1, appearance: settings.appearance });
    expect(parseSettings(text)).toEqual({
      appearance: settings.appearance,
      compact: DEFAULT_COMPACT_SETTINGS,
    });
  });

  it('解釈できない項目だけ既定値で埋める', () => {
    const text = JSON.stringify({
      appearance: { theme: 'rainbow', accent: '#123456' },
      compact: { mode: 'on', layout: 'grid' },
    });
    expect(parseSettings(text)).toEqual({
      appearance: { theme: 'system', accent: '#123456', frame: false },
      compact: { mode: 'on', layout: 'vertical' },
    });
  });
});

describe('serializeSettings', () => {
  it('版を付け、末尾を改行で終える', () => {
    const text = serializeSettings(settings);
    expect(JSON.parse(text)).toEqual({ version: 1, ...settings });
    expect(text.endsWith('\n')).toBe(true);
  });
});

describe('loadSettings / saveSettings', () => {
  const directories: string[] = [];

  const createHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), 'cc-park-settings-'));
    directories.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it('保存したものを読み戻せる', async () => {
    const home = await createHome();
    expect(await saveSettings(settings, { home })).toBe(true);
    expect(await loadSettings({ home })).toEqual(settings);
    expect(await readFile(buildSettingsPath(home), 'utf8')).toBe(serializeSettings(settings));
  });

  it('ファイルが無ければ既定値で起動する', async () => {
    const home = await createHome();
    expect(await loadSettings({ home })).toEqual(DEFAULT_SETTINGS);
  });

  it('読めなければ既定値、書けなければ false を返す', async () => {
    // home を省くと実行ユーザーのホームを使う。実ファイルには触れないよう fs を差し替える
    expect(await loadSettings({ fs: failingFs })).toEqual(DEFAULT_SETTINGS);
    expect(await saveSettings(settings, { fs: failingFs })).toBe(false);
  });
});
