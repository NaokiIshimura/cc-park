import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { CharacterState } from '../../types/agent.js';
import { Character } from './index.js';
import {
  CHARACTERS,
  CHARACTER_HEIGHT,
  CHARACTER_WIDTH,
  HEAD,
  getAppearance,
  getFrame,
} from '../../shared/characters.js';

const STATES = Object.keys(CHARACTERS) as CharacterState[];

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

  it.each(STATES)('%s は全フレームの頭の行が共通で顔と桁が揃っている', (state) => {
    for (const frame of CHARACTERS[state].frames) {
      const [head, face] = frame.split('\n');

      // 頭の行がポーズごとにずれると、顔の括弧と桁が合わなくなる
      expect(head).toBe(HEAD);
      // 括弧の位置（0 桁目と 5 桁目）が頭と顔で一致している
      expect(face?.[0]).toBe('(');
      expect(face?.[5]).toBe(')');
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
    expect(getFrame('waiting', 0)).toBe(CHARACTERS.waiting.frames[0]);
    expect(getFrame('waiting', 1)).toBe(CHARACTERS.waiting.frames[1]);
  });

  it('フレーム番号が範囲を超えたら循環する', () => {
    expect(getFrame('waiting', 2)).toBe(CHARACTERS.waiting.frames[0]);
    expect(getFrame('waiting', 101)).toBe(CHARACTERS.waiting.frames[1]);
  });

  it('負のフレーム番号でも循環する', () => {
    expect(getFrame('waiting', -1)).toBe(CHARACTERS.waiting.frames[1]);
  });

  it('単一フレームの状態は常に同じフレームを返す', () => {
    expect(getFrame('done', 7)).toBe(CHARACTERS.done.frames[0]);
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
