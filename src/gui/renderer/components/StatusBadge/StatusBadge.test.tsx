// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../../../shared/characters.js';
import type { CharacterState } from '../../../../types/agent.js';
import { StatusBadge } from './index.js';

const STATES = Object.keys(CHARACTERS) as CharacterState[];

afterEach(cleanup);

describe('StatusBadge', () => {
  it.each(STATES)('%s のラベルを表示する', (state) => {
    const { container } = render(<StatusBadge state={state} />);
    expect(container.textContent).toBe(CHARACTERS[state].label);
  });

  it('状態に対応する色を CSS 変数で指定する', () => {
    const { container } = render(<StatusBadge state="working" />);
    expect(container.querySelector('span')?.style.color).toBe('var(--ink-cyan)');
  });
});
