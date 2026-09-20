import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './index.js';

describe('EmptyState', () => {
  it('セッションが無いことを伝える', () => {
    const output = render(<EmptyState />).lastFrame() ?? '';
    expect(output).toContain('稼働中の Claude Code セッションはありません');
    expect(output).toContain('claude を起動すると');
  });
});
