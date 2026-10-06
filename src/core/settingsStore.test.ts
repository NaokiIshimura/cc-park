import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, type Appearance } from '../shared/themes.js';
import type { ScheduleFileSystem } from './scheduleStore.js';
import {
  buildSettingsPath,
  loadAppearance,
  parseAppearance,
  saveAppearance,
  serializeAppearance,
} from './settingsStore.js';

const appearance: Appearance = { theme: 'navy', accent: '#f59e0b' };

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

describe('parseAppearance', () => {
  it('serializeAppearance の出力を復元できる', () => {
    expect(parseAppearance(serializeAppearance(appearance))).toEqual(appearance);
  });

  it('JSON として壊れていれば既定値を返す', () => {
    expect(parseAppearance('{')).toEqual(DEFAULT_APPEARANCE);
  });

  it('オブジェクト以外なら既定値を返す', () => {
    expect(parseAppearance('42')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('null')).toEqual(DEFAULT_APPEARANCE);
  });

  it('appearance が無ければ既定値を返す', () => {
    expect(parseAppearance(JSON.stringify({ version: 1 }))).toEqual(DEFAULT_APPEARANCE);
  });

  it('解釈できない項目だけ既定値で埋める', () => {
    const text = JSON.stringify({ appearance: { theme: 'rainbow', accent: '#123456' } });
    expect(parseAppearance(text)).toEqual({ theme: 'system', accent: '#123456' });
  });
});

describe('serializeAppearance', () => {
  it('版を付け、末尾を改行で終える', () => {
    const text = serializeAppearance(appearance);
    expect(JSON.parse(text)).toEqual({ version: 1, appearance });
    expect(text.endsWith('\n')).toBe(true);
  });
});

describe('loadAppearance / saveAppearance', () => {
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
    expect(await saveAppearance(appearance, { home })).toBe(true);
    expect(await loadAppearance({ home })).toEqual(appearance);
    expect(await readFile(buildSettingsPath(home), 'utf8')).toBe(serializeAppearance(appearance));
  });

  it('ファイルが無ければ既定値で起動する', async () => {
    const home = await createHome();
    expect(await loadAppearance({ home })).toEqual(DEFAULT_APPEARANCE);
  });

  it('読めなければ既定値、書けなければ false を返す', async () => {
    // home を省くと実行ユーザーのホームを使う。実ファイルには触れないよう fs を差し替える
    expect(await loadAppearance({ fs: failingFs })).toEqual(DEFAULT_APPEARANCE);
    expect(await saveAppearance(appearance, { fs: failingFs })).toBe(false);
  });
});
