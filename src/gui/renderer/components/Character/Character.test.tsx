// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CHARACTERS, getFrame } from '../../../../shared/characters.js';
import type { CharacterState } from '../../../../types/agent.js';
import { Character } from './index.js';

const STATES = Object.keys(CHARACTERS) as CharacterState[];

afterEach(cleanup);

describe('Character', () => {
  it.each(STATES)('%s の AA を改行込みでそのまま描画する', (state) => {
    const { container } = render(<Character state={state} frame={0} />);
    expect(container.textContent).toBe(getFrame(state, 0));
  });

  it('フレーム番号でアニメーションが切り替わる', () => {
    const { container } = render(<Character state="working" frame={1} />);
    expect(container.textContent).toBe(getFrame('working', 1));
  });

  it('状態に対応する色を CSS 変数で指定する', () => {
    const { container } = render(<Character state="blocked" frame={0} />);
    expect(container.querySelector('pre')?.style.color).toBe('var(--ink-yellow)');
  });

  it('桁ずれを防ぐため pre で描画する', () => {
    const { container } = render(<Character state="waiting" frame={0} />);
    expect(container.querySelector('pre')).not.toBeNull();
  });
});
