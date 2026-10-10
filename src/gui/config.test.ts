import { describe, expect, it } from 'vitest';
import {
  CONFIG_FLAG,
  DEFAULT_ALWAYS_ON_TOP,
  DEFAULT_GUI_OPTIONS,
  DEFAULT_OPACITY,
  encodeGuiOptions,
  formatOpacity,
  nextOpacity,
  OPACITY_LEVELS,
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
  subagents: true,
  contextLimit: 200_000,
  theme: 'navy',
  accent: '#f59e0b',
  frame: false,
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

  it('テーマ・強調色・枠線の指定が無ければ null（保存済みの設定に従う）', () => {
    expect(DEFAULT_GUI_OPTIONS).toMatchObject({ theme: null, accent: null, frame: null });
  });

  it('知らないテーマ名・形式の違う強調色・真偽値でない枠線は null で埋める', () => {
    const parsed = parseGuiOptions([
      `${CONFIG_FLAG}=${JSON.stringify({ theme: 'rainbow', accent: 'orange', frame: 'off' })}`,
    ]);
    expect(parsed).toMatchObject({ theme: null, accent: null, frame: null });
  });
});

describe('DEFAULT_ALWAYS_ON_TOP', () => {
  it('最前面固定は既定で有効', () => {
    expect(DEFAULT_ALWAYS_ON_TOP).toBe(true);
  });
});

describe('DEFAULT_OPACITY', () => {
  it('起動時は不透明', () => {
    expect(DEFAULT_OPACITY).toBe(1);
  });

  it('段階の先頭と一致する', () => {
    expect(OPACITY_LEVELS[0]).toBe(DEFAULT_OPACITY);
  });
});

describe('nextOpacity', () => {
  it.each([
    [1, 0.8],
    [0.8, 0.6],
    [0.6, 1],
  ])('%s の次は %s', (current, expected) => {
    expect(nextOpacity(current)).toBe(expected);
  });

  it('丸め誤差を含む値でも次の段階へ進む', () => {
    expect(nextOpacity(0.800000011920929)).toBe(0.6);
  });

  it('段階に無い値は、それより薄い最初の段階へ進む', () => {
    expect(nextOpacity(0.9)).toBe(0.8);
  });

  it('最も薄い段階より薄ければ不透明へ戻す', () => {
    expect(nextOpacity(0.3)).toBe(1);
  });
});

describe('formatOpacity', () => {
  it.each([
    [1, '100%'],
    [0.8, '80%'],
    [0.6000000238418579, '60%'],
  ])('%s を %s と表示する', (opacity, expected) => {
    expect(formatOpacity(opacity)).toBe(expected);
  });
});
