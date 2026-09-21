import { describe, expect, it } from 'vitest';
import {
  CONFIG_FLAG,
  DEFAULT_ALWAYS_ON_TOP,
  DEFAULT_GUI_OPTIONS,
  encodeGuiOptions,
  parseGuiOptions,
  type GuiOptions,
} from './config.js';

const options: GuiOptions = {
  intervalMs: 1500,
  all: true,
  cwd: '/tmp/work',
  notify: false,
  highlightMs: 5000,
  selfSessionId: 'self-1',
  prompt: true,
  tokens: true,
  contextLimit: 200_000,
};

describe('DEFAULT_GUI_OPTIONS', () => {
  it('GUI は prompt / tokens を既定で有効にする', () => {
    expect(DEFAULT_GUI_OPTIONS).toMatchObject({ prompt: true, tokens: true });
  });

  it('完了済みセッションが居座らないよう all は既定で無効にする', () => {
    expect(DEFAULT_GUI_OPTIONS.all).toBe(false);
  });
});

describe('encodeGuiOptions', () => {
  it('フラグ付きの JSON 文字列にする', () => {
    expect(encodeGuiOptions(options)).toBe(`${CONFIG_FLAG}=${JSON.stringify(options)}`);
  });
});

describe('parseGuiOptions', () => {
  it('encodeGuiOptions の出力を復元できる', () => {
    expect(parseGuiOptions(['electron', 'main.js', encodeGuiOptions(options)])).toEqual(options);
  });

  it('フラグが無ければ既定値を返す', () => {
    expect(parseGuiOptions(['electron', 'main.js'])).toEqual(DEFAULT_GUI_OPTIONS);
  });

  it('JSON として壊れていれば既定値を返す', () => {
    expect(parseGuiOptions([`${CONFIG_FLAG}={`])).toEqual(DEFAULT_GUI_OPTIONS);
  });

  it('オブジェクト以外なら既定値を返す', () => {
    expect(parseGuiOptions([`${CONFIG_FLAG}=42`])).toEqual(DEFAULT_GUI_OPTIONS);
  });

  it('null なら既定値を返す', () => {
    expect(parseGuiOptions([`${CONFIG_FLAG}=null`])).toEqual(DEFAULT_GUI_OPTIONS);
  });

  it('型が合わない項目だけ既定値で埋める', () => {
    const parsed = parseGuiOptions([
      `${CONFIG_FLAG}=${JSON.stringify({ intervalMs: 'fast', all: true, cwd: 3, notify: 'yes' })}`,
    ]);
    expect(parsed).toEqual({
      ...DEFAULT_GUI_OPTIONS,
      all: true,
    });
  });

  it('有限でない数値は既定値で埋める', () => {
    const parsed = parseGuiOptions([`${CONFIG_FLAG}=${JSON.stringify({ highlightMs: null })}`]);
    expect(parsed.highlightMs).toBe(DEFAULT_GUI_OPTIONS.highlightMs);
  });

  it('selfSessionId が null でも受け取れる', () => {
    const parsed = parseGuiOptions([encodeGuiOptions({ ...options, selfSessionId: null })]);
    expect(parsed.selfSessionId).toBeNull();
  });

  it('cwd が未指定なら undefined になる', () => {
    const parsed = parseGuiOptions([encodeGuiOptions({ ...options, cwd: undefined })]);
    expect(parsed.cwd).toBeUndefined();
  });
});

describe('DEFAULT_ALWAYS_ON_TOP', () => {
  it('最前面固定は既定で有効', () => {
    expect(DEFAULT_ALWAYS_ON_TOP).toBe(true);
  });
});
