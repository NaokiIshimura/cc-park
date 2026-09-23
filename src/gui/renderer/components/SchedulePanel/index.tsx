import { useEffect, useState } from 'react';
import type { Schedule } from '../../../../shared/schedule.js';
import { ConfirmDialog } from '../ConfirmDialog/index.js';
import { ScheduleDialog } from '../ScheduleDialog/index.js';
import { ScheduleList } from '../ScheduleList/index.js';

interface SchedulePanelProps {
  readonly schedules: readonly Schedule[];
  readonly now: number;
  readonly home: string;
  /** 予約ダイアログへ渡すディレクトリ選択。パネル自身は使わない */
  readonly onPickDirectory: (defaultPath: string) => Promise<string | null>;
  readonly onSave: (schedule: Schedule) => void;
  readonly onDelete: (id: string) => void;
  readonly onToggle: (schedule: Schedule) => void;
  readonly onClose: () => void;
}

/** 編集中の対象。新規追加は `schedule: null` で表す。 */
interface Editing {
  readonly schedule: Schedule | null;
}

/** 予約の一覧と、追加・編集・削除の入口をまとめた画面。 */
export const SchedulePanel = ({
  schedules,
  now,
  home,
  onPickDirectory,
  onSave,
  onDelete,
  onToggle,
  onClose,
}: SchedulePanelProps) => {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Schedule | null>(null);

  const dialogOpen = editing !== null || deleting !== null;

  // ダイアログが開いている間は、そちらの取消を優先する
  useEffect(() => {
    if (dialogOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dialogOpen, onClose]);

  return (
    <div className="dialog-backdrop">
      <section className="panel" role="dialog" aria-modal="true" aria-label="予約">
        <header className="panel__header">
          <h2 className="panel__title">予約</h2>
          <button
            type="button"
            className="button"
            onClick={() => {
              setEditing({ schedule: null });
            }}
          >
            追加
          </button>
          <button type="button" className="button" onClick={onClose}>
            閉じる
          </button>
        </header>

        <div className="panel__body">
          <ScheduleList
            schedules={schedules}
            now={now}
            home={home}
            onEdit={(schedule) => {
              setEditing({ schedule });
            }}
            onDelete={setDeleting}
            onToggle={onToggle}
          />
        </div>

        <p className="panel__hint">指定した時刻に claude --bg でセッションを起動します</p>
      </section>

      {editing === null ? null : (
        <ScheduleDialog
          schedule={editing.schedule}
          home={home}
          onPickDirectory={onPickDirectory}
          onSubmit={(schedule) => {
            onSave(schedule);
            setEditing(null);
          }}
          onCancel={() => {
            setEditing(null);
          }}
        />
      )}

      {deleting === null ? null : (
        <ConfirmDialog
          action="削除"
          name={`${deleting.time} の予約`}
          onConfirm={() => {
            onDelete(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => {
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
};
