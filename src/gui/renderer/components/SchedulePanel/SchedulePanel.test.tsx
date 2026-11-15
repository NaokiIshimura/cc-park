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
  const onRun = vi.fn();
  const onClose = vi.fn();
  const onPickDirectory = vi.fn(async () => '/Users/naoki/GitHub/other');
  const result = render(
    <SchedulePanel
      schedules={schedules}
      now={NOW}
      home={HOME}
      onPickDirectory={onPickDirectory}
      onSave={onSave}
      onDelete={onDelete}
      onToggle={onToggle}
      onRun={onRun}
      onClose={onClose}
    />,
  );
  return {
    ...result,
    onSave,
    onDelete,
    onToggle,
    onRun,
    onClose,
    onPickDirectory,
    user: userEvent.setup(),
  };
};

const pressKey = (key: string) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
};

const pressEscape = () => {
  pressKey('Escape');
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

  it('ダイアログのディレクトリ選択を取り次ぐ', async () => {
    const { user, onPickDirectory, onSave } = setup([]);
    await user.click(screen.getByRole('button', { name: '追加' }));
    await user.click(screen.getByRole('button', { name: '選択…' }));
    expect(onPickDirectory).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('プロンプト'), 'おはよう');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ cwd: '/Users/naoki/GitHub/other' });
  });

  it('実行は確認してから伝える', async () => {
    const { user, onRun } = setup();
    await user.click(screen.getByRole('button', { name: '実行' }));
    expect(screen.getByText('「09:00 の予約」を 実行 しますか?')).toBeDefined();
    expect(onRun).not.toHaveBeenCalled();

    // セッションを始める操作なので、削除のような赤ではなく on と同じ緑にする
    expect(screen.getByRole('button', { name: '実行 する' }).className).toContain(
      'button--positive',
    );

    await user.click(screen.getByRole('button', { name: '実行 する' }));
    expect(onRun).toHaveBeenCalledWith('a1');
    expect(screen.queryByRole('button', { name: '実行 する' })).toBeNull();
  });

  it('実行の確認を取り消せる', async () => {
    const { user, onRun } = setup();
    await user.click(screen.getByRole('button', { name: '実行' }));
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '実行 する' })).toBeNull();
  });

  it('実行の確認は y で確定できる', async () => {
    const { user, onRun } = setup();
    await user.click(screen.getByRole('button', { name: '実行' }));
    pressKey('y');
    expect(onRun).toHaveBeenCalledWith('a1');
    expect(screen.queryByRole('button', { name: '実行 する' })).toBeNull();
  });

  it('実行の確認は他のキーで取り消せる', async () => {
    const { user, onRun } = setup();
    await user.click(screen.getByRole('button', { name: '実行' }));
    pressKey('n');
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '実行 する' })).toBeNull();
  });

  it('確認中の Escape は確認だけを取り消し、予約画面は閉じない', async () => {
    const { user, onRun, onClose } = setup();
    await user.click(screen.getByRole('button', { name: '実行' }));
    pressEscape();
    expect(onRun).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '実行 する' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '予約' })).toBeDefined();

    // 確認を閉じたあとの Escape は、これまでどおり予約画面を閉じる
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('削除は確認してから伝える', async () => {
    const { user, onDelete } = setup();
    await user.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByText('「09:00 の予約」を 削除 しますか?')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '削除 する' }));
    expect(onDelete).toHaveBeenCalledWith('a1');
  });

  it('削除の確認は y で確定できる', async () => {
    const { user, onDelete } = setup();
    await user.click(screen.getByRole('button', { name: '削除' }));
    pressKey('y');
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
