import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { CharacterState } from '../../types/agent.js';
import { CHARACTERS } from '../Character/index.js';
import { StatusBadge, STATUS_LABEL_WIDTH } from './index.js';

const STATES = Object.keys(CHARACTERS) as CharacterState[];

describe('StatusBadge', () => {
  it.each(STATES)('%s のラベルを表示する', (state) => {
    const output = render(<StatusBadge state={state} />).lastFrame() ?? '';
    expect(output).toContain(CHARACTERS[state].label);
  });

  it('全ラベルが表示幅に収まる', () => {
    for (const state of STATES) {
      expect(CHARACTERS[state].label.length).toBeLessThanOrEqual(STATUS_LABEL_WIDTH);
    }
  });
});
