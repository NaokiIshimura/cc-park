import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Schedule } from '../shared/schedule.js';
import {
  buildStorePath,
  loadSchedules,
  parseSchedules,
  saveSchedules,
  serializeSchedules,
  type ScheduleFileSystem,
} from './scheduleStore.js';

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 'a1',
  time: '09:00',
  cwd: '/Users/naoki',
  prompt: 'おはよう',
  enabled: true,
  lastFiredAt: null,
  ...overrides,
});

/** メモリ上に 1 ファイルだけ持つ簡易のファイルシステム。 */
const memoryFs = (initial?: string) => {
  const files = new Map<string, string>();
  if (initial !== undefined) {
    files.set(buildStorePath('/home'), initial);
  }

  const fs: ScheduleFileSystem = {
    readFile: async (path) => {
      const found = files.get(path);
      if (found === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return found;
    },
    writeFile: async (path, data) => {
      files.set(path, data);
    },
    rename: async (from, to) => {
      const found = files.get(from);
      if (found === undefined) {
        throw new Error('ENOENT');
      }
      files.delete(from);
      files.set(to, found);
    },
    mkdir: async () => undefined,
  };

  return { fs, files };
};

describe('buildStorePath', () => {
  it('ホーム直下の .cc-park に置く', () => {
    expect(buildStorePath('/Users/naoki')).toBe('/Users/naoki/.cc-park/schedules.json');
  });
});

describe('parseSchedules', () => {
  it('保存した形を読み戻せる', () => {
    expect(parseSchedules(serializeSchedules([schedule()]))).toEqual([schedule()]);
  });

  it('JSON として壊れていれば空配列', () => {
    expect(parseSchedules('{')).toEqual([]);
  });

  it('オブジェクトでなければ空配列', () => {
    expect(parseSchedules('"文字列"')).toEqual([]);
    expect(parseSchedules('null')).toEqual([]);
  });

  it('schedules が配列でなければ空配列', () => {
    expect(parseSchedules('{"version":1}')).toEqual([]);
    expect(parseSchedules('{"schedules":{}}')).toEqual([]);
  });

  it('要素がオブジェクトでなければ捨てる', () => {
    expect(parseSchedules('{"schedules":[1,null,"x"]}')).toEqual([]);
  });

  it('必須項目が欠けている予約は捨てる', () => {
    const text = JSON.stringify({
      schedules: [
        { time: '09:00', cwd: '/x', prompt: 'p' },
        { id: 'a', cwd: '/x', prompt: 'p' },
        { id: 'a', time: '09:00', prompt: 'p' },
        { id: 'a', time: '09:00', cwd: '/x' },
        { id: '', time: '09:00', cwd: '/x', prompt: 'p' },
      ],
    });
    expect(parseSchedules(text)).toEqual([]);
  });

  it('壊れた予約を捨てても、読めた予約は残す', () => {
    const text = JSON.stringify({ schedules: [{ id: 'a' }, schedule({ id: 'b' })] });
    expect(parseSchedules(text).map((item) => item.id)).toEqual(['b']);
  });

  it('enabled が欠けていれば有効として扱う', () => {
    const text = JSON.stringify({ schedules: [{ id: 'a', time: '09:00', cwd: '/x', prompt: 'p' }] });
    expect(parseSchedules(text)[0]?.enabled).toBe(true);
  });

  it('enabled が boolean ならそのまま使う', () => {
    const text = JSON.stringify({ schedules: [schedule({ enabled: false })] });
    expect(parseSchedules(text)[0]?.enabled).toBe(false);
  });

  it('lastFiredAt が数値でなければ null にする', () => {
    const text = JSON.stringify({
      schedules: [
        { id: 'a', time: '09:00', cwd: '/x', prompt: 'p', lastFiredAt: 'きのう' },
        { id: 'b', time: '09:00', cwd: '/x', prompt: 'p', lastFiredAt: Number.POSITIVE_INFINITY },
      ],
    });
    expect(parseSchedules(text).map((item) => item.lastFiredAt)).toEqual([null, null]);
  });

  it('lastFiredAt が数値ならそのまま使う', () => {
    const text = JSON.stringify({ schedules: [schedule({ lastFiredAt: 1789881096899 })] });
    expect(parseSchedules(text)[0]?.lastFiredAt).toBe(1789881096899);
  });
});

describe('serializeSchedules', () => {
  it('版を添えて改行で終える', () => {
    const text = serializeSchedules([schedule()]);
    expect(JSON.parse(text).version).toBe(1);
    expect(text.endsWith('\n')).toBe(true);
  });
});

describe('loadSchedules', () => {
  it('保存済みの予約を読む', async () => {
    const { fs } = memoryFs(serializeSchedules([schedule()]));
    expect(await loadSchedules({ home: '/home', fs })).toEqual([schedule()]);
  });

  it('ファイルが無ければ空配列', async () => {
    const { fs } = memoryFs();
    expect(await loadSchedules({ home: '/home', fs })).toEqual([]);
  });
});

describe('saveSchedules', () => {
  it('一時ファイルへ書いてから置き換える', async () => {
    const { fs, files } = memoryFs();
    const order: string[] = [];
    const spied: ScheduleFileSystem = {
      ...fs,
      writeFile: async (path, data) => {
        order.push(`write:${path}`);
        await fs.writeFile(path, data);
      },
      rename: async (from, to) => {
        order.push(`rename:${from}->${to}`);
        await fs.rename(from, to);
      },
    };

    expect(await saveSchedules([schedule()], { home: '/home', fs: spied })).toBe(true);
    expect(order).toEqual([
      'write:/home/.cc-park/schedules.json.tmp',
      'rename:/home/.cc-park/schedules.json.tmp->/home/.cc-park/schedules.json',
    ]);
    expect(files.has('/home/.cc-park/schedules.json.tmp')).toBe(false);
    expect(parseSchedules(files.get('/home/.cc-park/schedules.json') ?? '')).toEqual([schedule()]);
  });

  it('保存先のディレクトリを作る', async () => {
    const { fs } = memoryFs();
    const mkdir = vi.fn(async () => undefined);
    await saveSchedules([schedule()], { home: '/home', fs: { ...fs, mkdir } });
    expect(mkdir).toHaveBeenCalledWith('/home/.cc-park');
  });

  it('書き込みに失敗したら false を返す', async () => {
    const { fs } = memoryFs();
    const failing: ScheduleFileSystem = {
      ...fs,
      writeFile: async () => {
        throw new Error('EACCES');
      },
    };
    expect(await saveSchedules([schedule()], { home: '/home', fs: failing })).toBe(false);
  });
});

describe('実際のファイルへの読み書き', () => {
  const directories: string[] = [];

  const createHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), 'cc-park-schedules-'));
    directories.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it('保存したものを読み戻せる', async () => {
    const home = await createHome();
    expect(await saveSchedules([schedule()], { home })).toBe(true);
    expect(await loadSchedules({ home })).toEqual([schedule()]);
  });

  it('一時ファイルを残さない', async () => {
    const home = await createHome();
    await saveSchedules([schedule()], { home });
    await expect(readFile(`${buildStorePath(home)}.tmp`, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('保存していなければ空配列を返す', async () => {
    const home = await createHome();
    expect(await loadSchedules({ home })).toEqual([]);
  });

  it('起点を省略するとホーム配下を見る', async () => {
    // 読むだけなので、実ファイルの有無にかかわらず配列が返る
    await expect(loadSchedules()).resolves.toBeInstanceOf(Array);
  });

  it('起点を省略した保存もホーム配下を指す', async () => {
    const written: string[] = [];
    const { fs } = memoryFs();
    await saveSchedules([schedule()], {
      fs: {
        ...fs,
        writeFile: async (path, data) => {
          written.push(path);
          await fs.writeFile(path, data);
        },
      },
    });
    expect(written[0]).toContain('/.cc-park/schedules.json.tmp');
  });
});
