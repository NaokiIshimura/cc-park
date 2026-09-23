import { formatCwd } from '../../../../shared/formatCwd.js';
import { formatNextFire, type Schedule } from '../../../../shared/schedule.js';

/** ディレクトリ表示の上限桁数。ウィンドウ幅に収まる範囲にする。 */
const CWD_MAX_WIDTH = 28;

interface ScheduleListProps {
  readonly schedules: readonly Schedule[];
  /** 次回発火の算出に使う基準時刻 */
  readonly now: number;
  readonly home: string;
  readonly onEdit: (schedule: Schedule) => void;
  readonly onDelete: (schedule: Schedule) => void;
  readonly onToggle: (schedule: Schedule) => void;
}

/** 登録済みの予約を並べる。操作は呼び出し側へ渡すだけにする。 */
export const ScheduleList = ({
  schedules,
  now,
  home,
  onEdit,
  onDelete,
  onToggle,
}: ScheduleListProps) => {
  if (schedules.length === 0) {
    return <p className="schedule-list__empty">予約はまだありません</p>;
  }

  return (
    <ul className="schedule-list">
      {schedules.map((schedule) => (
        <li
          key={schedule.id}
          className={schedule.enabled ? 'schedule' : 'schedule schedule--off'}
        >
          <div className="schedule__head">
            <span className="schedule__time">{schedule.time}</span>
            <span className="schedule__next">{formatNextFire(schedule, now)}</span>
            <button
              type="button"
              className={schedule.enabled ? 'toggle toggle--on' : 'toggle'}
              aria-pressed={schedule.enabled}
              title="予約の有効 / 無効を切り替える"
              onClick={() => {
                onToggle(schedule);
              }}
            >
              {schedule.enabled ? 'on' : 'off'}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                onEdit(schedule);
              }}
            >
              編集
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                onDelete(schedule);
              }}
            >
              削除
            </button>
          </div>
          <p className="schedule__cwd">{formatCwd(schedule.cwd, CWD_MAX_WIDTH, home)}</p>
          <p className="schedule__prompt">{schedule.prompt}</p>
        </li>
      ))}
    </ul>
  );
};
