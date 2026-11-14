import { formatClock } from '../../../../shared/formatClock.js';
import { formatCount } from '../../../../shared/filterAgents.js';
import type { CompactMode } from '../../../../shared/compactSettings.js';
import { formatOpacity } from '../../../config.js';

interface HeaderProps {
  readonly count: number;
  /** 絞り込む前の件数。省略時は `count` と同じ（絞り込んでいない） */
  readonly total?: number;
  /** 絞り込みの内容（`[操作待ち] /foo` など）。絞り込んでいなければ空文字 */
  readonly filterLabel?: string;
  readonly lastUpdatedAt: number | null;
  readonly notifyEnabled: boolean;
  readonly alwaysOnTop: boolean;
  /** ウィンドウの不透明度（1 = 不透明） */
  readonly opacity: number;
  /** ミニ表示の ON / OFF */
  readonly compactMode: CompactMode;
  readonly isFetching: boolean;
  readonly onToggleNotify: () => void;
  readonly onToggleAlwaysOnTop: () => void;
  readonly onCycleOpacity: () => void;
  readonly onToggleCompact: () => void;
  readonly onRefresh: () => void;
  readonly onOpenSchedules: () => void;
  readonly onOpenSettings: () => void;
}

/** タイトル・件数・最終更新時刻・各トグルを表示し、更新と切り替えの操作を提供する。 */
export const Header = ({
  count,
  total = count,
  filterLabel = '',
  lastUpdatedAt,
  notifyEnabled,
  alwaysOnTop,
  opacity,
  compactMode,
  isFetching,
  onToggleNotify,
  onToggleAlwaysOnTop,
  onCycleOpacity,
  onToggleCompact,
  onRefresh,
  onOpenSchedules,
  onOpenSettings,
}: HeaderProps) => (
  <header className="header">
    <div className="header__title-area">
      <h1 className="header__title">CC Park</h1>
      {/*
        既定幅ではタイトルの行に余白が無いので、絞り込み中は `1/3` と短く出し、
        内訳（`1/3 sessions [操作待ち] /web`）はツールチップで見せる
      */}
      <span
        className="header__count"
        title={count === total ? undefined : `${formatCount(count, total)} ${filterLabel}`.trim()}
      >
        {count === total ? formatCount(count, total) : `${count}/${total}`}
      </span>
      {/* 既定幅のタイトルの行に収めるため状態は文字にせず、他のトグルと同じく点灯で示す */}
      <button
        type="button"
        className={compactMode === 'on' ? 'toggle toggle--on' : 'toggle'}
        aria-pressed={compactMode === 'on'}
        title="ウィンドウを AA だけのミニ表示に畳む"
        onClick={onToggleCompact}
      >
        mini
      </button>
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
