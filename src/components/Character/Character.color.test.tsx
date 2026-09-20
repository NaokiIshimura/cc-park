import { describe, expect, it } from 'vitest';

const ESC = String.fromCharCode(27);
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;

// chalk は読み込み時に色の有無を決めるため、import より先に強制しておく
process.env['FORCE_COLOR'] = '1';

const { render } = await import('ink-testing-library');
const { Character } = await import('./index.js');

describe('Character の装飾（色付き端末）', () => {
  it('選択時は太字になる', () => {
    const output = render(<Character state="waiting" frame={0} bold />).lastFrame() ?? '';
    expect(output).toContain(BOLD);
  });

  it('未選択では太字にならない', () => {
    const output = render(<Character state="waiting" frame={0} />).lastFrame() ?? '';
    expect(output).not.toContain(BOLD);
  });

  it('未選択でも暗くしない', () => {
    const output = render(<Character state="waiting" frame={0} />).lastFrame() ?? '';
    expect(output).not.toContain(DIM);
  });

  it('選択時も暗くしない', () => {
    const output = render(<Character state="waiting" frame={0} bold />).lastFrame() ?? '';
    expect(output).not.toContain(DIM);
  });
});
