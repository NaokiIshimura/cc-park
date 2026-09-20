// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './index.js';

afterEach(cleanup);

const setup = (overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      action="stop"
      name="worker-1"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel, user: userEvent.setup() };
};

describe('ConfirmDialog', () => {
  it('操作名と対象の名前を確認する', () => {
    setup();
    expect(screen.getByText('「worker-1」を stop しますか?')).toBeDefined();
  });

  it('操作名はそのまま見出しに使われる', () => {
    setup({ action: 'kill' });
    expect(screen.getByText('「worker-1」を kill しますか?')).toBeDefined();
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('kill の確認');
  });

  it('キー操作の案内を出す', () => {
    setup();
    expect(screen.getByText('y で実行 / 他キーで取消')).toBeDefined();
  });

  it('危険な操作では注意書きを添える', () => {
    setup({ action: 'kill', danger: true });
    expect(screen.getByText(/プロセスを直接終了します/)).toBeDefined();
  });

  it('モーダルとして扱われる', () => {
    setup();
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('実行ボタンで確定する', async () => {
    const { onConfirm, onCancel, user } = setup();
    await user.click(screen.getByRole('button', { name: 'stop する' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('実行ボタンのラベルは操作名に追従する', () => {
    setup({ action: 'kill' });
    expect(screen.getByRole('button', { name: 'kill する' })).toBeDefined();
  });

  it('取消ボタンで取り消す', async () => {
    const { onConfirm, onCancel, user } = setup();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
