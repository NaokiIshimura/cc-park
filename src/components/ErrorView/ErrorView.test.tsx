import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { FetchError } from '../../core/fetchAgents.js';
import { ErrorView } from './index.js';

const renderError = (error: FetchError) => render(<ErrorView error={error} />).lastFrame() ?? '';

describe('ErrorView', () => {
  it('エラーメッセージを表示する', () => {
    expect(renderError({ kind: 'exit', message: '失敗しました' })).toContain('失敗しました');
  });

  it.each([
    ['not-found', 'PATH'],
    ['timeout', '--interval'],
    ['exit', '手動で実行'],
    ['parse', '出力形式'],
    ['aborted', '中断'],
  ] as const)('%s には対処法を表示する', (kind, hint) => {
    expect(renderError({ kind, message: 'x' })).toContain(hint);
  });

  it('見出しを表示する', () => {
    expect(renderError({ kind: 'exit', message: 'x' })).toContain('取得できませんでした');
  });
});
