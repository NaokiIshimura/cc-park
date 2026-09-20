// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from './index.js';

afterEach(cleanup);

describe('EmptyState', () => {
  it('セッションが無いことを伝える', () => {
    render(<EmptyState />);
    expect(screen.getByText(/セッションはありません/)).toBeDefined();
  });

  it('次に取るべき行動を案内する', () => {
    render(<EmptyState />);
    expect(screen.getByText(/claude を起動すると/)).toBeDefined();
  });
});
