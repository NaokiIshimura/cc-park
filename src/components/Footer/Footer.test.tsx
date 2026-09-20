import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { Footer } from './index.js';

const renderFooter = (props: Partial<Parameters<typeof Footer>[0]> = {}) =>
  render(<Footer message={null} showPlatformNotice={false} {...props} />).lastFrame() ?? '';

describe('Footer', () => {
  it('キーバインドヘルプを表示する', () => {
    const output = renderFooter();
    expect(output).toContain('Enter コピー');
    expect(output).toContain('s stop');
    expect(output).toContain('q 終了');
  });

  it('メッセージがあれば表示する', () => {
    expect(renderFooter({ message: 'コピーしました' })).toContain('コピーしました');
  });

  it('メッセージが null なら何も出さない', () => {
    expect(renderFooter()).not.toContain('コピーしました');
  });

  it('macOS 以外では注意書きを表示する', () => {
    expect(renderFooter({ showPlatformNotice: true })).toContain('macOS のみ対応');
  });

  it('macOS では注意書きを表示しない', () => {
    expect(renderFooter()).not.toContain('macOS のみ対応');
  });
});
