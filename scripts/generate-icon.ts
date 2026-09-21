/**
 * アプリアイコン（assets/icon.png / assets/icon.icns）を生成する。
 *
 * AA の定義は `src/shared/characters.ts` の 1 箇所だけなので、アイコンも手で描かずに
 * そこから起こす。AA を変えたら `npm run icon:build` で作り直す。
 *
 * 生成には macOS 同梱の `sips` / `iconutil` を使う。
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARACTER_HEIGHT, CHARACTER_WIDTH, getFrame } from '../src/shared/characters.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');

/** 書き出す PNG の一辺。macOS のアイコンは 1024px 原寸から縮小して作る。 */
const CANVAS = 1024;

/** 角丸矩形が占める範囲。Apple のテンプレートに合わせて 1024 中 824px を使う。 */
const PLATE = 824;
/** 連続角丸の半径比。Apple のアイコン形状に近づける。 */
const PLATE_RADIUS_RATIO = 0.2237;

/** 背景（GUI のダークテーマの背景色）と、キャラクターの色（同テーマの cyan）。 */
const PLATE_TOP = '#1d2230';
const PLATE_BOTTOM = '#0d0f16';
const CHARACTER_COLOR = '#22d3ee';

/** アイコンに使うフレーム。両手を上げた `DONE!` の 2 枚目。 */
const FRAME = getFrame('justFinished', 1);

/** 1 セルの大きさ。端末の文字セルと同じく縦長にして、AA の見た目を保つ。 */
const CELL_WIDTH = 72;
const CELL_HEIGHT = 144;

/**
 * Block Elements を 2x2 の小片へ分解する表。
 * 値は [左上, 右上, 左下, 右下] の塗り。
 */
const QUADRANTS: Readonly<Record<string, readonly [boolean, boolean, boolean, boolean]>> = {
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

/** AA 1 フレームを矩形の集合へ変換する。 */
const toRects = (frame: string): string[] => {
  const rows = frame.split('\n');
  const artWidth = CHARACTER_WIDTH * CELL_WIDTH;
  const artHeight = CHARACTER_HEIGHT * CELL_HEIGHT;
  const originX = (CANVAS - artWidth) / 2;
  const originY = (CANVAS - artHeight) / 2;
  const halfWidth = CELL_WIDTH / 2;
  const halfHeight = CELL_HEIGHT / 2;

  const rects: string[] = [];
  rows.forEach((row, rowIndex) => {
    [...row].forEach((char, columnIndex) => {
      const quadrants = QUADRANTS[char];
      if (quadrants === undefined) {
        throw new Error(`アイコンに変換できない文字です: ${JSON.stringify(char)}`);
      }
      quadrants.forEach((filled, quadrantIndex) => {
        if (!filled) {
          return;
        }
        const x = originX + columnIndex * CELL_WIDTH + (quadrantIndex % 2) * halfWidth;
        const y = originY + rowIndex * CELL_HEIGHT + Math.floor(quadrantIndex / 2) * halfHeight;
        rects.push(
          `<rect x="${x}" y="${y}" width="${halfWidth}" height="${halfHeight}" shape-rendering="crispEdges" />`,
        );
      });
    });
  });
  return rects;
};

/** アイコン 1 枚ぶんの SVG を組み立てる。 */
const buildSvg = (): string => {
  const plateOffset = (CANVAS - PLATE) / 2;
  const radius = PLATE * PLATE_RADIUS_RATIO;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">`,
    '  <defs>',
    '    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">',
    `      <stop offset="0" stop-color="${PLATE_TOP}" />`,
    `      <stop offset="1" stop-color="${PLATE_BOTTOM}" />`,
    '    </linearGradient>',
    '    <clipPath id="plate-clip">',
    `      <rect x="${plateOffset}" y="${plateOffset}" width="${PLATE}" height="${PLATE}" rx="${radius}" ry="${radius}" />`,
    '    </clipPath>',
    '  </defs>',
    `  <rect x="${plateOffset}" y="${plateOffset}" width="${PLATE}" height="${PLATE}" rx="${radius}" ry="${radius}" fill="url(#plate)" />`,
    `  <g clip-path="url(#plate-clip)" fill="${CHARACTER_COLOR}">`,
    ...toRects(FRAME).map((rect) => `    ${rect}`),
    '  </g>',
    '</svg>',
  ].join('\n');
};

/** .icns に要る解像度一覧（一辺, ファイル名）。 */
const ICONSET_SIZES: readonly (readonly [number, string])[] = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];

const main = (): void => {
  mkdirSync(ASSETS, { recursive: true });

  const svgPath = join(ASSETS, 'icon.svg');
  const pngPath = join(ASSETS, 'icon.png');
  const iconsetPath = join(ASSETS, 'icon.iconset');

  writeFileSync(svgPath, `${buildSvg()}\n`);
  // sips は SVG を読めないため、ラスタライズだけ rsvg-convert に任せる
  execFileSync('rsvg-convert', ['-w', String(CANVAS), '-h', String(CANVAS), '-o', pngPath, svgPath]);

  rmSync(iconsetPath, { force: true, recursive: true });
  mkdirSync(iconsetPath);
  for (const [size, name] of ICONSET_SIZES) {
    execFileSync('sips', [
      '-z',
      String(size),
      String(size),
      pngPath,
      '--out',
      join(iconsetPath, name),
    ]);
  }
  execFileSync('iconutil', ['-c', 'icns', iconsetPath, '-o', join(ASSETS, 'icon.icns')]);
  rmSync(iconsetPath, { recursive: true });

  console.log(`生成しました: ${pngPath}`);
};

main();
