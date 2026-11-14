import { describe, expect, it } from 'vitest';
import { renderFrameBitmap, toQuadrantCells } from './aaBitmap.js';
import { CHARACTERS } from './characters.js';

/** ビットマップを `#` / `.` の文字列へ戻して読みやすくする。 */
const toAscii = ({ width, height, data }: ReturnType<typeof renderFrameBitmap>): string[] =>
  Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (data[(y * width + x) * 4 + 3] === 255 ? '#' : '.')).join(
      '',
    ),
  );

describe('toQuadrantCells', () => {
  it('1 文字を 2x2 の小片に分解する', () => {
    expect(toQuadrantCells('▛')).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 0, row: 1 },
    ]);
  });

  it('桁と行を小片の位置へずらす', () => {
    expect(toQuadrantCells(' ▗\n▘')).toEqual([
      { column: 3, row: 1 },
      { column: 0, row: 2 },
    ]);
  });

  it('変換できない文字は例外にする', () => {
    expect(() => toQuadrantCells('a')).toThrow('ビットマップに変換できない文字です');
  });

  it('すべてのキャラクターのフレームを変換できる', () => {
    for (const appearance of Object.values(CHARACTERS)) {
      for (const frame of appearance.frames) {
        expect(() => toQuadrantCells(frame)).not.toThrow();
      }
    }
  });
});

describe('renderFrameBitmap', () => {
  it('小片は縦長（横 unit x 縦 2unit）に塗る', () => {
    const bitmap = renderFrameBitmap('▘', { unit: 2 });
    expect([bitmap.width, bitmap.height]).toEqual([2, 4]);
    expect(toAscii(bitmap)).toEqual(['##', '##', '##', '##']);
  });

  it('塗った範囲だけを切り出す', () => {
    expect(toAscii(renderFrameBitmap('  \n ▙', { unit: 1 }))).toEqual([
      '#.',
      '#.',
      '##',
      '##',
    ]);
  });

  it('色は黒で、塗った画素だけ不透明にする', () => {
    const { data } = renderFrameBitmap('█', { unit: 1 });
    expect([...data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
  });

  it('空の AA は例外にする', () => {
    expect(() => renderFrameBitmap('   ', { unit: 1 })).toThrow('ビットマップにする AA が空です');
  });
});
