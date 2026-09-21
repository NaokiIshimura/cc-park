import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { CharacterState } from '../../types/agent.js';
import { Character } from './index.js';
import {
  CHARACTERS,
  CHARACTER_HEIGHT,
  CHARACTER_WIDTH,
  MARK,
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

/** 身体（マークの 2 行目）の各文字で、セルの下半分が塗られている領域。 */
const BOTTOM_HALF: Readonly<Record<string, readonly string[]>> = {
  ' ': [],
  '▝': [],
  '▀': [],
  '▜': ['right'],
  '█': ['left', 'right'],
};

/** 足（3 行目）に使ってよい文字と、それがセルの上半分で塗る領域。 */
const TOP_HALF: Readonly<Record<string, readonly string[]>> = {
  ' ': [],
  '▘': ['left'],
  '▝': ['right'],
  '▀': ['left', 'right'],
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

  it.each(STATES)('%s は全フレームで Claude Code のマークが共通である', (state) => {
    for (const frame of CHARACTERS[state].frames) {
      // マークがフレームごとに変わると、火花の行と桁が合わなくなる
      expect(frame.split('\n').slice(0, 2).join('\n')).toBe(MARK);
    }
  });

  it.each(STATES)('%s は等幅が保証された文字だけで構成されている', (state) => {
    for (const frame of CHARACTERS[state].frames) {
      const disallowed = [...frame.replaceAll('\n', '')].filter((char) => !ALLOWED_CHARS.has(char));
      expect(disallowed).toEqual([]);
    }
  });

  /*
   * `▗` `▖` のようにセルの下半分へ描かれる文字を足に使うと、身体との間に
   * 半セルぶんの空白ができて足が浮く。足が塗る領域が必ず身体の塗る領域に
   * 含まれていることを検証する。
   */
  it.each(STATES)('%s は足が身体と繋がっている', (state) => {
    const body = [...(MARK.split('\n')[1] ?? '')];

    for (const frame of CHARACTERS[state].frames) {
      const legs = [...(frame.split('\n')[2] ?? '')];

      legs.forEach((leg, column) => {
        // 上半分に描かれない文字は足に使えない
        expect(Object.keys(TOP_HALF)).toContain(leg);

        const touching = BOTTOM_HALF[body[column] ?? ' '] ?? [];
        for (const half of TOP_HALF[leg] ?? []) {
          expect(touching).toContain(half);
        }
      });
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
