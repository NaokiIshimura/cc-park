import { useEffect } from 'react';
import type { AttentionSettings } from '../../../../shared/attention.js';
import {
  PALETTES,
  resolvePalette,
  THEME_IDS,
  THEME_LABELS,
  type Appearance,
  type Palette,
  type ThemeId,
} from '../../../../shared/themes.js';

interface SettingsPanelProps {
  readonly appearance: Appearance;
  /** OS がダークモードか。`system` の見本と強調色の既定値を決めるのに使う */
  readonly prefersDark: boolean;
  /** 選んだ時点で呼ぶ。保存も含めて呼び出し側に任せる */
  readonly onChange: (appearance: Appearance) => void;
  /** 操作待ちの件数を Dock のバッジ・メニューバーに出すか */
  readonly attention: AttentionSettings;
  /** 選んだ時点で呼ぶ。保存も含めて呼び出し側に任せる */
  readonly onAttentionChange: (attention: AttentionSettings) => void;
  readonly onClose: () => void;
}

/** 見本に並べる文字色。一覧で目立つ状態の色を選ぶ */
const SWATCH_INKS = ['--ink-cyan', '--ink-yellow', '--ink-green', '--ink-red'] as const;

/** 配色の見本。背景・枠線と、キャラクターに使う色をいくつか並べる。 */
const Swatch = ({ palette }: { readonly palette: Palette }) => (
  <span
    className="swatch"
    aria-hidden="true"
    style={{
      background: palette.variables['--bg'],
      borderColor: palette.variables['--frame'],
    }}
  >
    {SWATCH_INKS.map((name) => (
      <span key={name} className="swatch__ink" style={{ background: palette.variables[name] }} />
    ))}
  </span>
);

/** `system` の見本はライトとダークを並べ、OS に追従することを示す。 */
const ThemeSwatch = ({ theme }: { readonly theme: ThemeId }) =>
  theme === 'system' ? (
    <span className="swatch-pair">
      <Swatch palette={PALETTES.light} />
      <Swatch palette={PALETTES.dark} />
    </span>
  ) : (
    <Swatch palette={PALETTES[theme]} />
  );

/** 配色テーマ・強調色・操作待ちの件数の出し方を選ぶ画面。選んだ時点で反映・保存される。 */
export const SettingsPanel = ({
  appearance,
  prefersDark,
  onChange,
  attention,
  onAttentionChange,
  onClose,
}: SettingsPanelProps) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  // 強調色を指定していなければ、配色ごとの既定（--ink-cyan）を入力欄の初期値として見せる
  const defaultAccent = resolvePalette(appearance.theme, prefersDark).variables['--ink-cyan'];

  return (
    <div className="dialog-backdrop">
      <section className="panel" role="dialog" aria-modal="true" aria-label="設定">
        <header className="panel__header">
          <h2 className="panel__title">設定</h2>
          <button type="button" className="button" onClick={onClose}>
            閉じる
          </button>
        </header>

        <div className="panel__body">
          <fieldset className="settings__group">
            <legend className="field__label">配色テーマ</legend>
            {THEME_IDS.map((theme) => (
              <label key={theme} className="settings__option">
                <input
                  type="radio"
                  name="theme"
                  value={theme}
                  checked={appearance.theme === theme}
                  onChange={() => {
                    onChange({ ...appearance, theme });
                  }}
                />
                <ThemeSwatch theme={theme} />
                <span>{THEME_LABELS[theme]}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="settings__group">
            <legend className="field__label">強調色（枠線・選択行・タイトル）</legend>
            <div className="field__row">
              <input
                type="color"
                className="settings__color"
                aria-label="強調色"
                value={appearance.accent ?? defaultAccent}
                onChange={(event) => {
                  onChange({ ...appearance, accent: event.target.value });
                }}
              />
              <button
                type="button"
                className="button"
                disabled={appearance.accent === null}
                onClick={() => {
                  onChange({ ...appearance, accent: null });
                }}
              >
                既定に戻す
              </button>
            </div>
          </fieldset>

          <fieldset className="settings__group">
            <legend className="field__label">枠線</legend>
            <label className="settings__option">
              <input
                type="checkbox"
                checked={appearance.frame}
                onChange={(event) => {
                  onChange({ ...appearance, frame: event.target.checked });
                }}
              />
              <span>ウィンドウの外周に枠線を描く</span>
            </label>
          </fieldset>

          <fieldset className="settings__group">
            <legend className="field__label">操作待ち（承認待ち・作業完了）の件数</legend>
            <label className="settings__option">
              <input
                type="checkbox"
                checked={attention.dockBadge}
                onChange={(event) => {
                  onAttentionChange({ ...attention, dockBadge: event.target.checked });
                }}
              />
              <span>Dock のアイコンにバッジで出す</span>
            </label>
            <label className="settings__option">
              <input
                type="checkbox"
                checked={attention.tray}
                onChange={(event) => {
                  onAttentionChange({ ...attention, tray: event.target.checked });
                }}
              />
              <span>メニューバーにアイコンを出す</span>
            </label>
          </fieldset>
        </div>

        <p className="panel__hint">選んだ設定は次回の起動時にも引き継がれます</p>
      </section>
    </div>
  );
};
