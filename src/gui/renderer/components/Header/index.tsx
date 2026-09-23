import { formatClock } from '../../../../shared/formatClock.js';

interface HeaderProps {
  readonly count: number;
  readonly lastUpdatedAt: number | null;
  readonly notifyEnabled: boolean;
  readonly alwaysOnTop: boolean;
  readonly isFetching: boolean;
  readonly onToggleNotify: () => void;
  readonly onToggleAlwaysOnTop: () => void;
  readonly onRefresh: () => void;
  readonly onOpenSchedules: () => void;
}

/** タイトル・件数・最終更新時刻・各トグルを表示し、更新と切り替えの操作を提供する。 */
export const Header = ({
  count,
  lastUpdatedAt,
  notifyEnabled,
  alwaysOnTop,
  isFetching,
  onToggleNotify,
  onToggleAlwaysOnTop,
  onRefresh,
  onOpenSchedules,
}: HeaderProps) => (
  <header className="header">
    <div className="header__title-area">
      <h1 className="header__title">CC Park</h1>
      <span className="header__count">{`${count} sessions`}</span>
    </div>

    <div className="header__actions">
      <button
        type="button"
        className={alwaysOnTop ? 'toggle toggle--on' : 'toggle'}
        aria-pressed={alwaysOnTop}
        title="ウィンドウを最前面に固定する"
        onClick={onToggleAlwaysOnTop}
      >
        {alwaysOnTop ? 'top:ON' : 'top:off'}
      </button>
      <button
        type="button"
        className={notifyEnabled ? 'toggle toggle--on' : 'toggle'}
        aria-pressed={notifyEnabled}
        onClick={onToggleNotify}
      >
        {notifyEnabled ? 'notify:ON' : 'notify:off'}
      </button>
      <button
        type="button"
        className="button"
        title="指定した時刻にセッションを起動する予約"
        onClick={onOpenSchedules}
      >
        予約
      </button>
      <button type="button" className="button" onClick={onRefresh}>
        更新
      </button>
      <span className="header__clock">
        {lastUpdatedAt === null ? 'updating...' : formatClock(lastUpdatedAt)}
      </span>
      {/* 取得中だけ点灯させ、レイアウトを揺らさないよう場所は常に確保する */}
      <span className={isFetching ? 'spinner spinner--active' : 'spinner'} aria-hidden="true" />
    </div>
  </header>
);
