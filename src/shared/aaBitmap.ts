/**
 * AA 1 フレームをビットマップ（画素の塗り）へ変換する。
 *
 * アプリアイコン（`scripts/generate-icon.ts`）とメニューバーのアイコン（GUI の main）が
 * 同じ分解表を使うよう、ここにまとめる。`node --experimental-strip-types` で
 * スクリプトから直接読めるよう、このファイルは他のモジュールを import しない。
 */

/**
 * Block Elements を 2x2 の小片へ分解する表。
 * 値は [左上, 右上, 左下, 右下] の塗り。
 */
export const QUADRANTS: Readonly<Record<string, readonly [boolean, boolean, boolean, boolean]>> = {
  ' ': [false, false, false, false],
  '█': [true, true, true, true],
  '▀': [true, true, false, false],
  '▄': [false, false, true, true],
  '▌': [true, false, true, false],
  '▐': [false, true, false, true],
  '▘': [true, false, false, false],
  '▝': [false, true, false, false],
  '▖': [false, false, true, false],
  '▗': [false, false, false, true],
  '▛': [true, true, true, false],
  '▜': [true, true, false, true],
  '▙': [true, false, true, true],
  '▟': [false, true, true, true],
};

/** 塗る小片の位置（小片単位。左上が原点）。 */
export interface QuadrantCell {
  readonly column: number;
  readonly row: number;
}

/**
 * AA を塗る小片の一覧へ分解する。
 * 1 文字が横 2 x 縦 2 の小片になる。変換できない文字があれば例外を投げる。
 */
export const toQuadrantCells = (frame: string): QuadrantCell[] => {
  const cells: QuadrantCell[] = [];
  frame.split('\n').forEach((line, lineIndex) => {
    [...line].forEach((char, charIndex) => {
      const quadrants = QUADRANTS[char];
      if (quadrants === undefined) {
        throw new Error(`ビットマップに変換できない文字です: ${JSON.stringify(char)}`);
      }
      quadrants.forEach((filled, quadrantIndex) => {
        if (filled) {
          cells.push({
            column: charIndex * 2 + (quadrantIndex % 2),
            row: lineIndex * 2 + Math.floor(quadrantIndex / 2),
          });
        }
      });
    });
  });
  return cells;
};

/** RGBA のビットマップ。`data` は 1 画素 4 バイトで左上から行順に並ぶ。 */
export interface Bitmap {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface RenderBitmapOptions {
  /**
   * 小片 1 つの横幅（px）。縦は端末の文字セルと同じく横の 2 倍にして、AA の見た目を保つ。
   */
  readonly unit: number;
}

/**
 * AA 1 フレームを、塗った範囲だけを切り出した黒のビットマップにする。
 *
 * 色は黒（不透明）と透明だけにする。macOS のメニューバーではテンプレート画像として扱い、
 * OS が明暗に合わせて塗り直す。黒なので RGBA / BGRA のどちらとして読まれても同じになる。
 */
export const renderFrameBitmap = (frame: string, { unit }: RenderBitmapOptions): Bitmap => {
  const cells = toQuadrantCells(frame);
  if (cells.length === 0) {
    throw new Error('ビットマップにする AA が空です');
  }

  const left = Math.min(...cells.map((cell) => cell.column));
  const top = Math.min(...cells.map((cell) => cell.row));
  const columns = Math.max(...cells.map((cell) => cell.column)) - left + 1;
  const rows = Math.max(...cells.map((cell) => cell.row)) - top + 1;

  const cellWidth = unit;
  const cellHeight = unit * 2;
  const width = columns * cellWidth;
  const height = rows * cellHeight;
  const data = new Uint8Array(width * height * 4);

  for (const cell of cells) {
    const x0 = (cell.column - left) * cellWidth;
    const y0 = (cell.row - top) * cellHeight;
    for (let y = y0; y < y0 + cellHeight; y += 1) {
      for (let x = x0; x < x0 + cellWidth; x += 1) {
        // RGB は 0（黒）のまま、アルファだけを立てる
        data[(y * width + x) * 4 + 3] = 255;
      }
    }
  }

  return { width, height, data };
};
