import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { Header } from './index.js';

const renderHeader = (props: Partial<Parameters<typeof Header>[0]> = {}) =>
  render(
    <Header count={3} lastUpdatedAt={null} notifyEnabled isFetching={false} {...props} />,
  ).lastFrame() ?? '';

describe('Header', () => {
  it('タイトルを表示する', () => {
    expect(renderHeader()).toContain('cc-park');
  });

  it('セッション件数を表示する', () => {
    expect(renderHeader({ count: 5 })).toContain('5 sessions');
  });

  it('未更新のときは updating... を表示する', () => {
    expect(renderHeader({ lastUpdatedAt: null })).toContain('updating...');
  });

  it('更新済みのときは時刻を表示する', () => {
    const output = renderHeader({ lastUpdatedAt: Date.now() });
    expect(output).not.toContain('updating...');
    expect(output).toMatch(/\d+:\d{2}:\d{2}/);
  });

  it('通知 ON を表示する', () => {
    expect(renderHeader({ notifyEnabled: true })).toContain('notify:ON');
  });

  it('ON と OFF を大文字小文字で見分けられる', () => {
    expect(renderHeader({ notifyEnabled: true })).not.toContain('notify:off');
    expect(renderHeader({ notifyEnabled: false })).not.toContain('notify:ON');
  });

  it('通知 OFF を表示する', () => {
    expect(renderHeader({ notifyEnabled: false })).toContain('notify:off');
  });

  it('取得中はインジケータを表示する', () => {
    expect(renderHeader({ isFetching: true })).toContain('*');
  });
});
