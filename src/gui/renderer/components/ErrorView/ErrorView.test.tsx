// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FetchError } from '../../../../core/fetchAgents.js';
import { ErrorView } from './index.js';

const KINDS: FetchError['kind'][] = ['not-found', 'timeout', 'exit', 'parse', 'aborted'];

afterEach(cleanup);

describe('ErrorView', () => {
  it('エラーメッセージを表示する', () => {
    render(<ErrorView error={{ kind: 'exit', message: '失敗しました' }} />);
    expect(screen.getByText('失敗しました')).toBeDefined();
  });

  it.each(KINDS)('%s には対処法を表示する', (kind) => {
    const { container } = render(<ErrorView error={{ kind, message: 'x' }} />);
    expect(container.querySelector('.error-view__hint')?.textContent).not.toBe('');
  });

  it('支援技術へエラーとして伝える', () => {
    render(<ErrorView error={{ kind: 'not-found', message: 'x' }} />);
    expect(screen.getByRole('alert')).toBeDefined();
  });
});
