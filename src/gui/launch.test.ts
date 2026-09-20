import { describe, expect, it, vi } from 'vitest';
import { encodeGuiOptions, DEFAULT_GUI_OPTIONS } from './config.js';
import {
  buildGuiArgs,
  buildGuiEnv,
  ELECTRON_MISSING_MESSAGE,
  GUI_ONCE_CONFLICT_MESSAGE,
  MODE_CONFLICT_MESSAGE,
  resolveElectronPath,
  resolveStartupMode,
  type StartupFlags,
} from './launch.js';

const flags = (overrides: Partial<StartupFlags> = {}): StartupFlags => ({
  cli: false,
  gui: false,
  once: false,
  ...overrides,
});

describe('resolveStartupMode', () => {
  it('フラグが無ければ GUI で起動する', () => {
    expect(resolveStartupMode(flags())).toEqual({ ok: true, mode: 'gui' });
  });

  it('--cli なら CLI で起動する', () => {
    expect(resolveStartupMode(flags({ cli: true }))).toEqual({ ok: true, mode: 'cli' });
  });

  it('--gui なら GUI で起動する', () => {
    expect(resolveStartupMode(flags({ gui: true }))).toEqual({ ok: true, mode: 'gui' });
  });

  it('--once だけなら CLI とみなす', () => {
    expect(resolveStartupMode(flags({ once: true }))).toEqual({ ok: true, mode: 'cli' });
  });

  it('--cli --once は CLI で起動する', () => {
    expect(resolveStartupMode(flags({ cli: true, once: true }))).toEqual({
      ok: true,
      mode: 'cli',
    });
  });

  it('--cli と --gui の同時指定は拒否する', () => {
    expect(resolveStartupMode(flags({ cli: true, gui: true }))).toEqual({
      ok: false,
      message: MODE_CONFLICT_MESSAGE,
    });
  });

  it('--gui と --once の同時指定は拒否する', () => {
    expect(resolveStartupMode(flags({ gui: true, once: true }))).toEqual({
      ok: false,
      message: GUI_ONCE_CONFLICT_MESSAGE,
    });
  });

  it('3 つ同時なら先にモードの矛盾を伝える', () => {
    expect(resolveStartupMode(flags({ cli: true, gui: true, once: true }))).toEqual({
      ok: false,
      message: MODE_CONFLICT_MESSAGE,
    });
  });
});

describe('buildGuiArgs', () => {
  it('main のパスと設定フラグを並べる', () => {
    expect(buildGuiArgs('/app/dist/gui/main.js', DEFAULT_GUI_OPTIONS)).toEqual([
      '/app/dist/gui/main.js',
      encodeGuiOptions(DEFAULT_GUI_OPTIONS),
    ]);
  });
});

describe('buildGuiEnv', () => {
  it('ELECTRON_RUN_AS_NODE を取り除く', () => {
    const env = buildGuiEnv({ PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' });
    expect(env).toEqual({ PATH: '/usr/bin' });
  });

  it('元の環境変数を書き換えない', () => {
    const original = { ELECTRON_RUN_AS_NODE: '1' };
    buildGuiEnv(original);
    expect(original.ELECTRON_RUN_AS_NODE).toBe('1');
  });
});

describe('resolveElectronPath', () => {
  it('default の実行ファイルパスを返す', async () => {
    const importer = vi.fn(async () => ({ default: '/path/to/electron' }));
    await expect(resolveElectronPath(importer)).resolves.toBe('/path/to/electron');
  });

  it('読み込みに失敗したら null を返す', async () => {
    const importer = vi.fn(async () => {
      throw new Error('Cannot find module');
    });
    await expect(resolveElectronPath(importer)).resolves.toBeNull();
  });

  it('default が文字列でなければ null を返す', async () => {
    const importer = vi.fn(async () => ({ default: 42 }));
    await expect(resolveElectronPath(importer)).resolves.toBeNull();
  });

  it('default が空文字なら null を返す', async () => {
    const importer = vi.fn(async () => ({ default: '' }));
    await expect(resolveElectronPath(importer)).resolves.toBeNull();
  });

  it('default を持たなければ null を返す', async () => {
    const importer = vi.fn(async () => ({}));
    await expect(resolveElectronPath(importer)).resolves.toBeNull();
  });

  it('null が返っても落ちない', async () => {
    const importer = vi.fn(async () => null);
    await expect(resolveElectronPath(importer)).resolves.toBeNull();
  });
});

describe('案内メッセージ', () => {
  it('electron 不在の案内に代替手段を含む', () => {
    expect(ELECTRON_MISSING_MESSAGE).toContain('--cli');
  });

  it('モード指定の矛盾を伝える', () => {
    expect(MODE_CONFLICT_MESSAGE).toContain('--cli');
    expect(MODE_CONFLICT_MESSAGE).toContain('--gui');
  });

  it('--once との併用不可を伝える', () => {
    expect(GUI_ONCE_CONFLICT_MESSAGE).toContain('--once');
  });
});
