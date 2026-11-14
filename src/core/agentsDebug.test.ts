import { describe, expect, it, vi } from 'vitest';
import {
  buildDebugPath,
  createAgentsObserver,
  type DebugFileSystem,
} from './agentsDebug.js';

const fakeFs = () => {
  const files = new Map<string, string>();
  const fs: DebugFileSystem = {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async (path: string, data: string) => {
      files.set(path, data);
    }),
    appendFile: vi.fn(async (path: string, data: string) => {
      files.set(path, (files.get(path) ?? '') + data);
    }),
  };
  return { fs, files };
};

const AT = new Date('2026-11-14T00:00:00.000Z');
const unknown = [{ sessionId: 's', status: 'napping' }];
const known = [{ sessionId: 's', status: 'busy' }];

describe('buildDebugPath', () => {
  it('予約や設定と同じ .cc-park の下に置く', () => {
    expect(buildDebugPath('/Users/naoki')).toBe('/Users/naoki/.cc-park/debug');
  });
});

describe('createAgentsObserver', () => {
  it('解釈できない値は値ごとに 1 回だけ知らせる', () => {
    const warn = vi.fn();
    const observe = createAgentsObserver({ warn });
    observe('[]', unknown);
    observe('[]', unknown);
    observe('[]', [...unknown, { sessionId: 't', kind: 'remote', status: 'busy' }]);

    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      'claude agents --json に解釈できない値があります: status=napping',
      'claude agents --json に解釈できない値があります: kind=remote',
    ]);
  });

  it('--debug でなければ何も書かない', async () => {
    const { fs } = fakeFs();
    const observe = createAgentsObserver({ fs });
    observe('[]', unknown);
    await Promise.resolve();
    expect(fs.mkdir).not.toHaveBeenCalled();
  });

  it('--debug なら出力を残し、内容が変わったときだけ書き直す', async () => {
    const { fs, files } = fakeFs();
    const observe = createAgentsObserver({ fs, debugDirectory: '/d' });
    observe('[1]', known);
    observe('[1]', known);
    observe('[2]', known);

    await vi.waitFor(() => {
      expect(files.get('/d/agents.json')).toBe('[2]');
    });
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
  });

  it('--debug なら未知の値を時刻付きで追記する', async () => {
    const { fs, files } = fakeFs();
    const observe = createAgentsObserver({ fs, debugDirectory: '/d', now: () => AT });
    observe('[1]', unknown);
    observe('[2]', [...unknown, { sessionId: 't', tty: 'x', status: 'busy' }]);

    await vi.waitFor(() => {
      expect(files.get('/d/unknown.log')).toBe(
        '2026-11-14T00:00:00.000Z status=napping\n2026-11-14T00:00:00.000Z key=tty\n',
      );
    });
  });

  it('書き込みに失敗しても例外を投げず、次の記録を続ける', async () => {
    const { fs, files } = fakeFs();
    vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('EACCES'));
    const observe = createAgentsObserver({ fs, debugDirectory: '/d' });

    expect(() => {
      observe('[1]', known);
    }).not.toThrow();
    observe('[2]', known);

    await vi.waitFor(() => {
      expect(files.get('/d/agents.json')).toBe('[2]');
    });
  });
});
