import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { CharacterState } from '../../types/agent.js';
import { Character } from './index.js';
import {
  CHARACTERS,
  CHARACTER_HEIGHT,
  CHARACTER_WIDTH,
  BODY,
  getAppearance,
  getFrame,
} from '../../shared/characters.js';

const STATES = Object.keys(CHARACTERS) as CharacterState[];

/**
 * AA に使ってよい文字。
 *
 * Menlo / SF Mono の `cmap` と `hmtx` を実測し、**両方に収録されていて**
 * 字送り幅が ASCII と同じことを確認した文字だけを並べている。
 * `✻` などの星記号や `◡` は SF Mono に無く、フォールバック描画で桁が崩れるため入れない。
 */
const ALLOWED_CHARS = new Set([' ', ...'▀▁▂▃▄▅▆▇█▉▊▋▌▍▎▏▐░▒▓▔▕▖▗▘▙▚▛▜▝▞▟']);

/** ブロック文字が塗る象限。1 セルを 2x2 のピクセルとして扱う。 */
const QUADRANTS: Readonly<Record<string, readonly [number, number][]>> = {
  ' ': [],
  '▘': [[0, 0]],
  '▝': [[0, 1]],
  '▖': [[1, 0]],
  '▗': [[1, 1]],
  '▀': [[0, 0], [0, 1]],
  '▄': [[1, 0], [1, 1]],
  '▌': [[0, 0], [1, 0]],
  '▐': [[0, 1], [1, 1]],
  '▛': [[0, 0], [0, 1], [1, 0]],
  '▜': [[0, 0], [0, 1], [1, 1]],
  '▙': [[0, 0], [1, 0], [1, 1]],
  '▟': [[0, 1], [1, 0], [1, 1]],
  '█': [[0, 0], [0, 1], [1, 0], [1, 1]],
};

/** 1 フレームを 2 倍解像度のピクセルへ展開する。 */
const toPixels = (frame: string): boolean[][] => {
  const rows = frame.split('\n');
  const pixels = Array.from({ length: rows.length * 2 }, () =>
    Array.from({ length: CHARACTER_WIDTH * 2 }, () => false),
  );

  rows.forEach((row, rowIndex) => {
    [...row].forEach((char, column) => {
      for (const [dy, dx] of QUADRANTS[char] ?? []) {
        const line = pixels[rowIndex * 2 + dy];
        if (line !== undefined) {
          line[column * 2 + dx] = true;
        }
      }
    });
  });

  return pixels;
};

/** 塗られたピクセルが 4 近傍で 1 つの塊になっているか。 */
const isSingleShape = (pixels: readonly boolean[][]): boolean => {
  const filled: [number, number][] = [];
  pixels.forEach((row, y) => row.forEach((on, x) => on && filled.push([y, x])));

  const start = filled[0];
  if (start === undefined) {
    return true;
  }

  const seen = new Set([start.join()]);
  const stack = [start];
  while (stack.length > 0) {
    const [y, x] = stack.pop() as [number, number];
    for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = [y + dy, x + dx].join();
      if (pixels[y + dy]?.[x + dx] === true && !seen.has(key)) {
        seen.add(key);
        stack.push([y + dy, x + dx]);
      }
    }
  }

  return seen.size === filled.length;
};

describe('frames 定義', () => {
  it.each(STATES)('%s の全フレームが %i 行 x %i 桁に揃っている', (state) => {
    for (const frame of CHARACTERS[state].frames) {
      const lines = frame.split('\n');
      expect(lines).toHaveLength(CHARACTER_HEIGHT);
      for (const line of lines) {
        expect([...line]).toHaveLength(CHARACTER_WIDTH);
      }
    }
  });

  it.each(STATES)('%s は 1 つ以上のフレームを持つ', (state) => {
    expect(CHARACTERS[state].frames.length).toBeGreaterThan(0);
  });

  it.each(STATES)('%s は全フレームで身体と頭の中央が共通である', (state) => {
    for (const frame of CHARACTERS[state].frames) {
      const [head, body] = frame.split('\n');

      // 身体はどのフレームでも変わらない
      expect(body).toBe(BODY);
      // 頭は両端（手）だけが変わり、中央は動かない
      expect(head?.slice(1, -1)).toBe('▐▛███▛█');
    }
  });

  it.each(STATES)('%s は等幅が保証された文字だけで構成されている', (state) => {
    for (const frame of CHARACTERS[state].frames) {
      const disallowed = [...frame.replaceAll('\n', '')].filter((char) => !ALLOWED_CHARS.has(char));
      expect(disallowed).toEqual([]);
    }
  });

  /*
   * 手や足に置く文字を間違えると、身体との間に半セルぶんの空白ができて
   * 部品が浮く（例: 桁 0 の手に `▘` を使うと身体と接しない）。
   * 塗られたピクセルが 1 つの塊になっていることで、浮きを検出する。
   */
  it.each(STATES)('%s は全フレームで身体から離れた部品が無い', (state) => {
    for (const frame of CHARACTERS[state].frames) {
      expect(isSingleShape(toPixels(frame))).toBe(true);
    }
  });

  it('ソート優先度が一意である', () => {
    const priorities = STATES.map((state) => CHARACTERS[state].priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it('blocked が最優先で表示される', () => {
    const sorted = [...STATES].sort((a, b) => CHARACTERS[a].priority - CHARACTERS[b].priority);
    expect(sorted[0]).toBe('blocked');
  });
});

describe('getAppearance', () => {
  it('既知の状態の定義を返す', () => {
    expect(getAppearance('working').label).toBe('BUSY');
  });

  it('未知の状態は unknown の定義へフォールバックする', () => {
    expect(getAppearance('nope' as CharacterState).label).toBe('UNKNOWN');
  });
});

describe('getFrame', () => {
  it('フレーム番号でフレームを切り替える', () => {
    expect(getFrame('blocked', 0)).toBe(CHARACTERS.blocked.frames[0]);
    expect(getFrame('blocked', 1)).toBe(CHARACTERS.blocked.frames[1]);
  });

  it('フレーム番号が範囲を超えたら循環する', () => {
    expect(getFrame('blocked', 2)).toBe(CHARACTERS.blocked.frames[0]);
    expect(getFrame('blocked', 101)).toBe(CHARACTERS.blocked.frames[1]);
  });

  it('負のフレーム番号でも循環する', () => {
    expect(getFrame('blocked', -1)).toBe(CHARACTERS.blocked.frames[1]);
  });

  it('単一フレームの状態は常に同じフレームを返す', () => {
    expect(getFrame('done', 7)).toBe(CHARACTERS.done.frames[0]);
  });

  /*
   * 入力待ち・完了・停止・未知はこちらの操作を促さないので静止させる。
   * 動いている行だけを見れば済むようにするための約束なので、テストで固定する。
   */
  it.each<CharacterState>(['waiting', 'done', 'stopped', 'unknown'])(
    '%s は静止している',
    (state) => {
      expect(CHARACTERS[state].frames).toHaveLength(1);
      expect(getFrame(state, 3)).toBe(getFrame(state, 0));
    },
  );

  it.each<CharacterState>(['blocked', 'justFinished', 'working'])(
    '%s はアニメーションする',
    (state) => {
      expect(CHARACTERS[state].frames.length).toBeGreaterThan(1);
    },
  );
});

describe('Character', () => {
  it.each(STATES)('%s を描画できる', (state) => {
    const { lastFrame } = render(<Character state={state} frame={0} />);
    expect(lastFrame()).toContain(CHARACTERS[state].frames[0]?.split('\n')[1]?.trimEnd());
  });

  it('frame を進めると描画内容が変わる', () => {
    const first = render(<Character state="working" frame={0} />).lastFrame();
    const second = render(<Character state="working" frame={1} />).lastFrame();
    expect(first).not.toBe(second);
  });

  it('bold を渡しても描画内容は変わらない', () => {
    const plain = render(<Character state="waiting" frame={0} />).lastFrame();
    const bold = render(<Character state="waiting" frame={0} bold />).lastFrame();
    expect(bold).toBe(plain);
  });
});
