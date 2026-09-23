// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Schedule } from '../../../../shared/schedule.js';
import { SchedulePanel } from './index.js';

const HOME = '/Users/naoki';

const NOW = new Date(2026, 8, 23, 8, 0, 0, 0).getTime();

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 'a1',
  time: '09:00',
  cwd: '/Users/naoki/GitHub/cc-park',
  prompt: '今日の TODO を整理して',
  enabled: true,
  lastFiredAt: null,
  ...overrides,
});

const setup = (schedules: readonly Schedule[] = [schedule()]) => {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onToggle = vi.fn();
  const onClose = vi.fn();
  const result = render(
    <SchedulePanel
      schedules={schedules}
      now={NOW}
      home={HOME}
      onSave={onSave}
      onDelete={onDelete}
      onToggle={onToggle}
      onClose={onClose}
    />,
  );
  return { ...result, onSave, onDelete, onToggle, onClose, user: userEvent.setup() };
};

const pressEscape = () => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
};

afterEach(cleanup);

describe('SchedulePanel', () => {
  it('登録済みの予約を並べる', () => {
    setup();
    expect(screen.getByText('今日の TODO を整理して')).toBeDefined();
  });

  it('閉じるで閉じる', async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape で閉じる', () => {
    const { onClose } = setup();
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('追加からダイアログを開いて保存する', async () => {
    const { user, onSave } = setup([]);
    await user.click(screen.getByRole('button', { name: '追加' }));
    await user.type(screen.getByLabelText('プロンプト'), 'おはよう');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ time: '09:00', prompt: 'おはよう' });
    // 保存したらダイアログは閉じる
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
  });

  it('追加ダイアログを取消で閉じる', async () => {
    const { user, onSave } = setup([]);
    await user.click(screen.getByRole('button', { name: '追加' }));
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
  });

  it('ダイアログを開いている間は Escape でパネルを閉じない', async () => {
    const { user, onClose } = setup([]);
    await user.click(screen.getByRole('button', { name: '追加' }));
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('編集からダイアログを開く', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: '編集' }));
    expect(screen.getByText('予約を編集')).toBeDefined();
  });

  it('削除は確認してから伝える', async () => {
    const { user, onDelete } = setup();
    await user.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByText('「09:00 の予約」を 削除 しますか?')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '削除 する' }));
    expect(onDelete).toHaveBeenCalledWith('a1');
  });

  it('削除の確認を取り消せる', async () => {
    const { user, onDelete } = setup();
    await user.click(screen.getByRole('button', { name: '削除' }));
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '削除 する' })).toBeNull();
  });

  it('有効・無効の切り替えを伝える', async () => {
    const { user, onToggle } = setup();
    await user.click(screen.getByRole('button', { name: 'on' }));
    expect(onToggle).toHaveBeenCalledWith(schedule());
  });
});
