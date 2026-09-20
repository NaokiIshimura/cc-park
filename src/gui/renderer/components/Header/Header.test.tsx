// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Header } from './index.js';

afterEach(cleanup);

const setup = (overrides: Partial<Parameters<typeof Header>[0]> = {}) => {
  const onToggleNotify = vi.fn();
  const onToggleAlwaysOnTop = vi.fn();
  const onRefresh = vi.fn();
  const result = render(
    <Header
      count={2}
      lastUpdatedAt={null}
      notifyEnabled
      alwaysOnTop={false}
      isFetching={false}
      onToggleNotify={onToggleNotify}
      onToggleAlwaysOnTop={onToggleAlwaysOnTop}
      onRefresh={onRefresh}
      {...overrides}
    />,
  );
  return { ...result, onToggleNotify, onToggleAlwaysOnTop, onRefresh, user: userEvent.setup() };
};

describe('Header', () => {
  it('タイトルを表示する', () => {
    setup();
    expect(screen.getByText('CC Park')).toBeDefined();
  });

  it('セッション数を表示する', () => {
    setup({ count: 5 });
    expect(screen.getByText('5 sessions')).toBeDefined();
  });

  it('初回取得前は updating... と出す', () => {
    setup({ lastUpdatedAt: null });
    expect(screen.getByText('updating...')).toBeDefined();
  });

  it('最終更新時刻を時刻表記で出す', () => {
    setup({ lastUpdatedAt: new Date('2026-09-21T03:04:05').getTime() });
    expect(screen.getByText('3:04:05')).toBeDefined();
  });

  it('通知が有効なら押下状態で表示する', () => {
    setup({ notifyEnabled: true });
    const toggle = screen.getByRole('button', { name: 'notify:ON' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('通知が無効なら非押下状態で表示する', () => {
    setup({ notifyEnabled: false });
    const toggle = screen.getByRole('button', { name: 'notify:off' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('通知トグルを押すと通知が切り替わる', async () => {
    const { onToggleNotify, user } = setup();
    await user.click(screen.getByRole('button', { name: 'notify:ON' }));
    expect(onToggleNotify).toHaveBeenCalledTimes(1);
  });

  it('最前面固定が無効なら非押下状態で表示する', () => {
    setup({ alwaysOnTop: false });
    expect(screen.getByRole('button', { name: 'top:off' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('最前面固定が有効なら押下状態で表示する', () => {
    setup({ alwaysOnTop: true });
    expect(screen.getByRole('button', { name: 'top:ON' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('最前面トグルを押すと切り替えを要求する', async () => {
    const { onToggleAlwaysOnTop, user } = setup();
    await user.click(screen.getByRole('button', { name: 'top:off' }));
    expect(onToggleAlwaysOnTop).toHaveBeenCalledTimes(1);
  });

  it('更新ボタンを押すと再取得する', async () => {
    const { onRefresh, user } = setup();
    await user.click(screen.getByRole('button', { name: '更新' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('取得中はインジケータを点灯させる', () => {
    const { container } = setup({ isFetching: true });
    expect(container.querySelector('.spinner--active')).not.toBeNull();
  });

  it('取得中でなければインジケータは消灯する', () => {
    const { container } = setup({ isFetching: false });
    expect(container.querySelector('.spinner--active')).toBeNull();
  });
});
