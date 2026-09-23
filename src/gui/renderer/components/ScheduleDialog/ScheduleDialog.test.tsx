// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Schedule } from '../../../../shared/schedule.js';
import { ScheduleDialog } from './index.js';

const HOME = '/Users/naoki';

const existing: Schedule = {
  id: 'a1',
  time: '21:30',
  cwd: '/Users/naoki/GitHub/cc-park',
  prompt: '今日の作業をまとめて',
  enabled: false,
  lastFiredAt: 1789881096899,
};

const setup = (schedule: Schedule | null = null) => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <ScheduleDialog schedule={schedule} home={HOME} onSubmit={onSubmit} onCancel={onCancel} />,
  );
  return { ...result, onSubmit, onCancel, user: userEvent.setup() };
};

const field = (label: string): HTMLInputElement =>
  screen.getByLabelText(label) as HTMLInputElement;

afterEach(cleanup);

describe('ScheduleDialog', () => {
  it('新規追加は既定値で開く', () => {
    setup();
    expect(screen.getByText('予約を追加')).toBeDefined();
    expect(field('時刻').value).toBe('09:00');
    expect(field('ディレクトリ').value).toBe(HOME);
    expect(field('プロンプト').value).toBe('');
  });

  it('編集は既存の値で開く', () => {
    setup(existing);
    expect(screen.getByText('予約を編集')).toBeDefined();
    expect(field('時刻').value).toBe('21:30');
    expect(field('ディレクトリ').value).toBe('/Users/naoki/GitHub/cc-park');
    expect(field('プロンプト').value).toBe('今日の作業をまとめて');
  });

  it('入力した内容を整形して渡す', async () => {
    const { user, onSubmit } = setup();
    await user.clear(field('ディレクトリ'));
    await user.type(field('ディレクトリ'), '~/GitHub/cc-park/');
    await user.type(field('プロンプト'), '  今日の TODO を整理して  ');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      time: '09:00',
      cwd: '/Users/naoki/GitHub/cc-park',
      prompt: '今日の TODO を整理して',
      enabled: true,
      lastFiredAt: null,
    });
  });

  it('新規追加には ID を発番する', async () => {
    const { user, onSubmit } = setup();
    await user.type(field('プロンプト'), 'おはよう');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSubmit.mock.calls[0]?.[0].id).toBeTruthy();
  });

  it('編集では ID と有効・無効と発火済みを引き継ぐ', async () => {
    const { user, onSubmit } = setup(existing);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      id: 'a1',
      enabled: false,
      lastFiredAt: 1789881096899,
    });
  });

  it('プロンプトが空なら保存せずエラーを出す', async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('プロンプトを入力してください。')).toBeDefined();
  });

  it('ディレクトリが空なら保存せずエラーを出す', async () => {
    const { user, onSubmit } = setup();
    await user.clear(field('ディレクトリ'));
    await user.type(field('プロンプト'), 'おはよう');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('ディレクトリを入力してください。')).toBeDefined();
  });

  it('時刻が空なら保存せずエラーを出す', async () => {
    const { user, onSubmit } = setup();
    await user.clear(field('時刻'));
    await user.type(field('プロンプト'), 'おはよう');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('時刻は HH:MM の形式で入力してください。')).toBeDefined();
  });

  it('取消で閉じる', async () => {
    const { user, onCancel } = setup();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Escape で閉じる', () => {
    const { onCancel } = setup();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Escape 以外のキーでは閉じない', () => {
    const { onCancel } = setup();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
