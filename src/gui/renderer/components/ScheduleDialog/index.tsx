import { useEffect, useId, useState } from 'react';
import {
  createSchedule,
  createScheduleId,
  normalizeCwd,
  validateSchedule,
  type Schedule,
  type ScheduleFieldErrors,
} from '../../../../shared/schedule.js';

interface ScheduleDialogProps {
  /** 編集対象。新規追加なら null */
  readonly schedule: Schedule | null;
  /** `~` の展開に使うホームディレクトリ */
  readonly home: string;
  /**
   * ディレクトリ選択ダイアログを開く。選ばれた絶対パスを返し、取り消したら null。
   * 実際の表示は main プロセスが行うため、呼び出しだけを受け取る。
   */
  readonly onPickDirectory: (defaultPath: string) => Promise<string | null>;
  readonly onSubmit: (schedule: Schedule) => void;
  readonly onCancel: () => void;
}

/**
 * 予約の追加・編集フォーム。
 *
 * 入力の正しさは `shared/schedule.ts` の検証に任せ、ここは表示と受け渡しだけを行う。
 */
export const ScheduleDialog = ({
  schedule,
  home,
  onPickDirectory,
  onSubmit,
  onCancel,
}: ScheduleDialogProps) => {
  const [time, setTime] = useState(schedule?.time ?? '09:00');
  const [cwd, setCwd] = useState(schedule?.cwd ?? home);
  const [prompt, setPrompt] = useState(schedule?.prompt ?? '');
  const [errors, setErrors] = useState<ScheduleFieldErrors>({});
  const [isPicking, setIsPicking] = useState(false);
  const cwdId = useId();

  // Escape で閉じる。一覧のキー操作は開いている間 GuiApp 側で止めてある
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onCancel]);

  /** ディレクトリ選択ダイアログの結果を入力欄へ反映する。 */
  const pickDirectory = async () => {
    setIsPicking(true);
    try {
      const picked = await onPickDirectory(normalizeCwd(cwd, home));
      if (picked !== null) {
        setCwd(picked);
      }
    } catch {
      // 開けなかったときは手入力に任せる。入力済みの値は消さない
    } finally {
      setIsPicking(false);
    }
  };

  const submit = () => {
    const input = { time, cwd: normalizeCwd(cwd, home), prompt };
    const validated = validateSchedule(input);
    if (!validated.ok) {
      setErrors(validated.errors);
      return;
    }

    const id = schedule?.id ?? createScheduleId();
    onSubmit({
      ...createSchedule(input, id),
      // 編集のときは有効・無効と発火済みの記録を引き継ぐ
      enabled: schedule?.enabled ?? true,
      lastFiredAt: schedule?.lastFiredAt ?? null,
    });
  };

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog dialog--form"
        role="dialog"
        aria-modal="true"
        aria-label={schedule === null ? '予約の追加' : '予約の編集'}
      >
        <p className="dialog__message">{schedule === null ? '予約を追加' : '予約を編集'}</p>

        <label className="field">
          <span className="field__label">時刻</span>
          <input
            className="field__input"
            type="time"
            value={time}
            onChange={(event) => {
              setTime(event.target.value);
            }}
          />
        </label>
        {errors.time === undefined ? null : <p className="field__error">{errors.time}</p>}

        {/* 選択ボタンを横に置くため、label で囲まず htmlFor で結び付ける */}
        <div className="field">
          <label className="field__label" htmlFor={cwdId}>
            ディレクトリ
          </label>
          <div className="field__row">
            <input
              id={cwdId}
              className="field__input"
              type="text"
              value={cwd}
              placeholder="~/GitHub/cc-park"
              onChange={(event) => {
                setCwd(event.target.value);
              }}
            />
            <button
              type="button"
              className="button"
              // 開いている間は押せなくして、選択ダイアログが重ならないようにする
              disabled={isPicking}
              onClick={() => {
                void pickDirectory();
              }}
            >
              選択…
            </button>
          </div>
        </div>
        {errors.cwd === undefined ? null : <p className="field__error">{errors.cwd}</p>}

        <label className="field">
          <span className="field__label">プロンプト</span>
          <textarea
            className="field__input field__input--multiline"
            rows={3}
            value={prompt}
            placeholder="今日の TODO を整理して"
            onChange={(event) => {
              setPrompt(event.target.value);
            }}
          />
        </label>
        {errors.prompt === undefined ? null : <p className="field__error">{errors.prompt}</p>}

        <p className="dialog__hint">毎日この時刻に claude --bg で起動します</p>

        <div className="dialog__actions">
          <button type="button" className="button" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="button" onClick={submit}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
};
