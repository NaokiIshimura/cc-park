// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Schedule } from '../../../../shared/schedule.js';
import { ScheduleList } from './index.js';

const HOME = '/Users/naoki';

/** タイムゾーンに左右されないよう、ローカル時刻から組み立てる。 */
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
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onToggle = vi.fn();
  const onRun = vi.fn();
  const result = render(
    <ScheduleList
      schedules={schedules}
      now={NOW}
      home={HOME}
      onEdit={onEdit}
      onDelete={onDelete}
      onToggle={onToggle}
      onRun={onRun}
    />,
  );
  return { ...result, onEdit, onDelete, onToggle, onRun, user: userEvent.setup() };
};

afterEach(cleanup);

describe('ScheduleList', () => {
  it('予約が無ければ案内を出す', () => {
    setup([]);
    expect(screen.getByText('予約はまだありません')).toBeDefined();
  });

  it('時刻と次回発火を表示する', () => {
    setup();
    expect(screen.getByText('09:00')).toBeDefined();
    expect(screen.getByText('今日 09:00')).toBeDefined();
  });

  it('ディレクトリをホーム短縮で表示する', () => {
    setup();
    expect(screen.getByText('~/GitHub/cc-park')).toBeDefined();
  });

  it('繰り返す曜日を表示する（曜日が無い予約は毎日）', () => {
    setup([
      schedule({ id: 'a' }),
      schedule({ id: 'b', days: [1, 2, 3, 4, 5] }),
      schedule({ id: 'c', days: [1, 3, 5] }),
    ]);
    expect(screen.getByText('毎日')).toBeDefined();
    expect(screen.getByText('平日')).toBeDefined();
    expect(screen.getByText('月・水・金')).toBeDefined();
  });

  it('プロンプトを表示する', () => {
    setup();
    expect(screen.getByText('今日の TODO を整理して')).toBeDefined();
  });

  it('無効な予約は停止中として表示する', () => {
    setup([schedule({ enabled: false })]);
    expect(screen.getByText('停止中')).toBeDefined();
    expect(screen.getByRole('button', { name: 'off' })).toBeDefined();
  });

  it('編集を伝える', async () => {
    const { user, onEdit } = setup();
    await user.click(screen.getByRole('button', { name: '編集' }));
    expect(onEdit).toHaveBeenCalledWith(schedule());
  });

  it('削除を伝える', async () => {
    const { user, onDelete } = setup();
    await user.click(screen.getByRole('button', { name: '削除' }));
    expect(onDelete).toHaveBeenCalledWith(schedule());
  });

  it('今すぐ実行を伝える', async () => {
    const { user, onRun } = setup();
    await user.click(screen.getByRole('button', { name: '実行' }));
    expect(onRun).toHaveBeenCalledWith(schedule());
  });

  it('無効（off）の予約も実行できる', async () => {
    const { user, onRun } = setup([schedule({ enabled: false })]);
    await user.click(screen.getByRole('button', { name: '実行' }));
    expect(onRun).toHaveBeenCalledWith(schedule({ enabled: false }));
  });

  it('有効・無効の切り替えを伝える', async () => {
    const { user, onToggle } = setup();
    await user.click(screen.getByRole('button', { name: 'on' }));
    expect(onToggle).toHaveBeenCalledWith(schedule());
  });

  it('複数の予約を並べる', () => {
    setup([schedule({ id: 'a', time: '07:30' }), schedule({ id: 'b', time: '21:00' })]);
    expect(screen.getAllByRole('button', { name: '編集' })).toHaveLength(2);
  });
});
