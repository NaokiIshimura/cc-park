import { formatClock } from '../../../../shared/formatClock.js';
import { formatOpacity } from '../../../config.js';

interface HeaderProps {
  readonly count: number;
  readonly lastUpdatedAt: number | null;
  readonly notifyEnabled: boolean;
  readonly alwaysOnTop: boolean;
  /** ウィンドウの不透明度（1 = 不透明） */
  readonly opacity: number;
  readonly isFetching: boolean;
  readonly onToggleNotify: () => void;
  readonly onToggleAlwaysOnTop: () => void;
  readonly onCycleOpacity: () => void;
  readonly onRefresh: () => void;
  readonly onOpenSchedules: () => void;
  readonly onOpenSettings: () => void;
}

/** タイトル・件数・最終更新時刻・各トグルを表示し、更新と切り替えの操作を提供する。 */
export const Header = ({
  count,
  lastUpdatedAt,
  notifyEnabled,
  alwaysOnTop,
  opacity,
  isFetching,
  onToggleNotify,
  onToggleAlwaysOnTop,
  onCycleOpacity,
  onRefresh,
  onOpenSchedules,
  onOpenSettings,
}: HeaderProps) => (
  <header className="header">
    <div className="header__title-area">
      <h1 className="header__title">CC Park</h1>
      <span className="header__count">{`${count} sessions`}</span>
      {/* 操作側は既定幅で余白が無いため、段を分けて空いているタイトル側に置く */}
      <button
        type="button"
        className="button"
        title="配色テーマと強調色を選ぶ"
        onClick={onOpenSettings}
      >
        設定
      </button>
    </div>

    {/*
     * 操作側に並べると既定幅に収まらないため、タイトルの行の右端に置く。
     * 透過している間だけ点灯させ、不透明に戻っていることを見分けやすくする。
     */}
    <button
      type="button"
      className={opacity < 1 ? 'toggle toggle--on header__opacity' : 'toggle header__opacity'}
      aria-pressed={opacity < 1}
      title="ウィンドウの不透明度を切り替える"
      onClick={onCycleOpacity}
    >
      {`opacity:${formatOpacity(opacity)}`}
    </button>

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
