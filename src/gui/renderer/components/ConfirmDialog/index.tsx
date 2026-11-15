import { useEffect } from 'react';
import { isControlActivation, toGuiSelectionCommand } from '../../hooks/useGuiSelection.js';

interface ConfirmDialogProps {
  /** 実行しようとしている操作の名前（stop / kill） */
  readonly action: string;
  /** 対象の表示名 */
  readonly name: string;
  /** 後戻りできない操作として強調するか */
  readonly danger?: boolean;
  /**
   * 確定ボタンの色。既定の `danger` は赤（stop / kill / 削除）。
   * `positive` は `on` のトグルと同じ緑で、何かを始める操作（予約の実行）に使う
   */
  readonly tone?: 'danger' | 'positive';
  /**
   * ダイアログ自身がキー操作（`y` で確定 / 他のキーで取消）を受けるか。
   * 一覧の確認（stop / kill）は一覧のキー操作が受けるので付けない。
   * 一覧のキー操作が止まっている画面（予約画面）の中で開くときに付ける
   */
  readonly handleKeys?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** 破壊的操作の 2 段階確認。キー操作（y / その他）と同じ判断をボタンでも行えるようにする。 */
export const ConfirmDialog = ({
  action,
  name,
  danger = false,
  tone = 'danger',
  handleKeys = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  useEffect(() => {
    if (!handleKeys) {
      return;
    }

    // 一覧の確認と同じ判断にする。y は確定、割り当ての有無を問わず他の印字キー・Esc は取消、
    // 装飾キーや Cmd+… などのショートカットは無視する
    const onKeyDown = (event: KeyboardEvent) => {
      if (isControlActivation(event.key, event.target)) {
        return;
      }
      const command = toGuiSelectionCommand(event);
      if (command === null) {
        return;
      }
      event.preventDefault();
      if (command === 'confirm') {
        onConfirm();
        return;
      }
      onCancel();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleKeys, onConfirm, onCancel]);

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={`${action} の確認`}>
        <p className="dialog__message">{`「${name}」を ${action} しますか?`}</p>
        <p className="dialog__hint">
          {danger
            ? 'y で実行 / 他キーで取消（プロセスを直接終了します）'
            : 'y で実行 / 他キーで取消'}
        </p>
        <div className="dialog__actions">
          <button type="button" className="button" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className={tone === 'positive' ? 'button button--positive' : 'button button--danger'}
            onClick={onConfirm}
          >
            {`${action} する`}
          </button>
        </div>
      </div>
    </div>
  );
};
