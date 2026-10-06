// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PALETTES, THEME_IDS, THEME_LABELS, type Appearance } from '../../../../shared/themes.js';
import { SettingsPanel } from './index.js';

afterEach(cleanup);

const setup = (appearance: Appearance = { theme: 'system', accent: null }, prefersDark = false) => {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const result = render(
    <SettingsPanel
      appearance={appearance}
      prefersDark={prefersDark}
      onChange={onChange}
      onClose={onClose}
    />,
  );
  return { ...result, onChange, onClose, user: userEvent.setup() };
};

const accentInput = (): HTMLInputElement => screen.getByLabelText('強調色');

describe('SettingsPanel', () => {
  it('すべてのテーマを選択肢として並べ、現在のテーマを選択状態にする', () => {
    setup({ theme: 'navy', accent: null });
    for (const theme of THEME_IDS) {
      expect(screen.getByRole('radio', { name: THEME_LABELS[theme] })).toBeDefined();
    }
    expect(
      (screen.getByRole('radio', { name: THEME_LABELS.navy }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('テーマを選ぶと強調色はそのままに変更を伝える', async () => {
    const { user, onChange } = setup({ theme: 'system', accent: '#123456' });
    await user.click(screen.getByRole('radio', { name: THEME_LABELS.forest }));
    expect(onChange).toHaveBeenCalledWith({ theme: 'forest', accent: '#123456' });
  });

  it('OS に合わせるテーマにはライトとダークの見本を並べる', () => {
    const { container } = setup();
    expect(container.querySelector('.swatch-pair')?.querySelectorAll('.swatch')).toHaveLength(2);
  });

  it('強調色が未指定なら配色ごとの既定色を入力欄に見せる', () => {
    setup({ theme: 'navy', accent: null });
    expect(accentInput().value).toBe(PALETTES.navy.variables['--ink-cyan']);
  });

  it('OS に合わせるテーマでは OS の外観に応じた既定色を見せる', () => {
    setup({ theme: 'system', accent: null }, true);
    expect(accentInput().value).toBe(PALETTES.dark.variables['--ink-cyan']);
  });

  it('強調色を選ぶとテーマはそのままに変更を伝える', () => {
    const { onChange } = setup({ theme: 'slate', accent: null });
    fireEvent.change(accentInput(), { target: { value: '#f59e0b' } });
    expect(onChange).toHaveBeenCalledWith({ theme: 'slate', accent: '#f59e0b' });
  });

  it('既定に戻すと強調色の指定を消す', async () => {
    const { user, onChange } = setup({ theme: 'slate', accent: '#f59e0b' });
    await user.click(screen.getByRole('button', { name: '既定に戻す' }));
    expect(onChange).toHaveBeenCalledWith({ theme: 'slate', accent: null });
  });

  it('強調色を指定していなければ既定に戻すは押せない', () => {
    setup();
    expect(
      (screen.getByRole('button', { name: '既定に戻す' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('閉じるボタンと Escape で閉じる', async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Escape 以外のキーでは閉じない', () => {
    const { onClose } = setup();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
