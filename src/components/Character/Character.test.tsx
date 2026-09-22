import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { CharacterState } from '../../types/agent.js';
import { Character } from './index.js';
import {
  CHARACTERS,
  CHARACTER_HEIGHT,
  CHARACTER_WIDTH,
  BODY,
  MINI_WIDTH,
  getMiniFrame,
  miniPerRow,
  buildMiniRows,
  countMiniRows,
  countMiniHeight,
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

  /*
   * 逆に、手が頭と横に隣接すると手に見えなくなる（桁 8 に `▖` `▌` のような
   * セルの左半分を使う文字を置くと、隣の `█` とくっつく）。
   * 手は身体と縦に繋がりつつ、頭との間は空いていなければならない。
   */
  it.each(STATES)('%s は全フレームで手が頭とくっついていない', (state) => {
    // 頭の中央（桁 1-7）が占めるピクセルの x 座標
    const headX = new Set(Array.from({ length: 14 }, (_, i) => i + 2));

    for (const frame of CHARACTERS[state].frames) {
      const pixels = toPixels(frame);

      // 手が入るのは頭の行（上 2 ピクセル）の両端の桁
      for (const y of [0, 1]) {
        for (const x of [0, 1, CHARACTER_WIDTH * 2 - 2, CHARACTER_WIDTH * 2 - 1]) {
          if (pixels[y]?.[x] !== true) {
            continue;
          }
          for (const dx of [-1, 1]) {
            expect(headX.has(x + dx) && pixels[y]?.[x + dx] === true).toBe(false);
          }
        }
      }
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

  /*
   * `working` はサブエージェントのミニキャラクターと同じ「閉じる → 開く」で動かす。
   * 周期がずれると親子で動きが揃わなくなるので、フレーム数を揃えたままにする。
   */
  it('working はミニキャラクターと同じ周期で動く', () => {
    const cycle = CHARACTERS.working.frames.length;
    expect(cycle).toBe(2);
    expect(getMiniFrame(cycle)).toBe(getMiniFrame(0));
    expect(getMiniFrame(cycle - 1)).not.toBe(getMiniFrame(0));
  });

  /* `working` で動くのは足だけ。手が動くと `BLOCKED` / `DONE!` と見分けがつかなくなる。 */
  it('working は足だけが動く', () => {
    const rows = CHARACTERS.working.frames.map((frame) => frame.split('\n'));
    const [first, second] = rows;

    // 手（1 行目の両端）は下ろしたまま
    for (const [head] of rows) {
      expect(head?.at(0)).toBe(' ');
      expect(head?.at(-1)).toBe(' ');
    }
    // 足（3 行目）だけがフレームごとに変わる
    expect(first?.[2]).not.toBe(second?.[2]);
  });

  /*
   * 足が 1 本も無いと「キャラクターが欠けている」ように見えてしまう。
   * 静止させる状態でも足は残す約束なので、全状態・全フレームで固定する。
   */
  it.each(STATES)('%s はどのフレームでも足がある', (state) => {
    for (const frame of CHARACTERS[state].frames) {
      const legs = frame.split('\n')[2] ?? '';
      expect(legs.trim()).not.toBe('');
    }
  });
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

describe('ミニキャラクター', () => {
  /** フレーム番号から 1 体ぶんを取り出す。 */
  const mini = (frame: number) => getMiniFrame(frame);

  it('1 行 x 2 桁に収まっている', () => {
    for (let frame = 0; frame < 4; frame += 1) {
      expect(mini(frame)).not.toContain('\n');
      expect([...mini(frame)]).toHaveLength(MINI_WIDTH);
    }
  });

  it('等幅が保証された文字だけで構成されている', () => {
    for (let frame = 0; frame < 4; frame += 1) {
      expect([...mini(frame)].filter((char) => !ALLOWED_CHARS.has(char))).toEqual([]);
    }
  });

  /* 親と同じく、部品が浮いていないことを確かめる。 */
  it('離れた部品が無い', () => {
    for (let frame = 0; frame < 4; frame += 1) {
      expect(isSingleShape(toPixels(mini(frame)))).toBe(true);
    }
  });

  it('フレームを進めると足の形が変わる', () => {
    expect(mini(0)).not.toBe(mini(1));
  });

  it('フレーム番号が範囲を超えたら循環する', () => {
    expect(mini(2)).toBe(mini(0));
    expect(mini(-1)).toBe(mini(1));
  });
});

describe('miniPerRow', () => {
  it('表示幅に並ぶ体数を求める', () => {
    // 1 体 2 桁 + 体の間 1 桁
    expect(miniPerRow(2)).toBe(1);
    expect(miniPerRow(4)).toBe(1);
    expect(miniPerRow(5)).toBe(2);
    expect(miniPerRow(8)).toBe(3);
    expect(miniPerRow(70)).toBe(23);
  });

  it('幅が足りなくても 1 体は並べる', () => {
    expect(miniPerRow(0)).toBe(1);
    expect(miniPerRow(-10)).toBe(1);
  });
});

describe('buildMiniRows', () => {
  // 右端まで横に並べ、入りきらなくなったところで折り返す
  it('入りきる間は折り返さない', () => {
    expect(buildMiniRows(5, 0, 10)).toEqual([
      [0, 1, 2, 3, 4].map((i) => getMiniFrame(i)).join(' '),
    ]);
  });

  it('入りきらなくなったら折り返す', () => {
    expect(buildMiniRows(5, 0, 3)).toEqual([
      [0, 1, 2].map((i) => getMiniFrame(i)).join(' '),
      // 2 行目は「行 + 列」でずらすので先頭が 1 から始まる
      [1, 2].map((i) => getMiniFrame(i)).join(' '),
    ]);
  });

  it('0 体なら行そのものを出さない', () => {
    expect(buildMiniRows(0, 0, 3)).toEqual([]);
    expect(buildMiniRows(-1, 0, 3)).toEqual([]);
  });

  it('体数が増えても省略しない', () => {
    const bodies = (count: number, perRow: number) =>
      buildMiniRows(count, 0, perRow).join('').match(/[▛▜]{2}/g)?.length ?? 0;

    for (const count of [1, 3, 4, 10, 25]) {
      expect(bodies(count, 3)).toBe(count);
      expect(bodies(count, 23)).toBe(count);
    }
  });

  it('隣り合う体は足が揃わないようフレームをずらす', () => {
    const row = buildMiniRows(3, 0, 3)[0] ?? '';
    expect(row.slice(0, MINI_WIDTH)).not.toBe(row.slice(MINI_WIDTH + 1, MINI_WIDTH * 2 + 1));
  });

  it('上下に重なる体も足が揃わない', () => {
    const [first, second] = buildMiniRows(4, 0, 3);
    expect(first?.slice(0, MINI_WIDTH)).not.toBe(second?.slice(0, MINI_WIDTH));
  });
});

describe('countMiniRows / countMiniHeight', () => {
  it('体数と 1 行あたりの体数から行数を求める', () => {
    expect(countMiniRows(0, 3)).toBe(0);
    expect(countMiniRows(1, 3)).toBe(1);
    expect(countMiniRows(3, 3)).toBe(1);
    expect(countMiniRows(4, 3)).toBe(2);
  });

  it('負の体数は 0 行にする', () => {
    expect(countMiniRows(-1, 3)).toBe(0);
  });

  it('折り返したときの空行を足した高さを返す', () => {
    expect(countMiniHeight(0, 3)).toBe(0);
    expect(countMiniHeight(3, 3)).toBe(1);
    // 2 行 + 間の空行 1 行
    expect(countMiniHeight(4, 3)).toBe(3);
    expect(countMiniHeight(7, 3)).toBe(5);
  });
});
