import { useEffect } from 'react';
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

/** 配色テーマと強調色を選ぶ画面。選んだ時点で反映・保存される。 */
export const SettingsPanel = ({ appearance, prefersDark, onChange, onClose }: SettingsPanelProps) => {
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
        </div>

        <p className="panel__hint">選んだ設定は次回の起動時にも引き継がれます</p>
      </section>
    </div>
  );
};
