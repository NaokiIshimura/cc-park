// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Footer } from './index.js';

afterEach(cleanup);

describe('Footer', () => {
  it('キーバインドのヘルプを表示する', () => {
    render(<Footer message={null} />);
    expect(screen.getByText(/Enter コピー/)).toBeDefined();
  });

  it('最前面固定のキーを案内する', () => {
    render(<Footer message={null} />);
    expect(screen.getByText(/t 最前面/)).toBeDefined();
  });

  it('メッセージが無ければ何も出さない', () => {
    const { container } = render(<Footer message={null} />);
    expect(container.querySelector('.footer__message')).toBeNull();
  });

  it('メッセージがあれば表示する', () => {
    render(<Footer message="コピーしました" />);
    expect(screen.getByText('コピーしました')).toBeDefined();
  });
});
