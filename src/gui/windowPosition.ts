import type { Rectangle } from './compact.js';

/**
 * ウィンドウを画面の四隅・中央へ動かす位置の判断（`←` / `→`）。
 *
 * main（ウィンドウを動かす）から使う純粋関数だけを置く。
 * 置く先は作業領域（メニューバーと Dock を除いた範囲）で、端にぴったり付ける。
 */

export type WindowPosition = 'bottomRight' | 'topRight' | 'bottomLeft' | 'topLeft' | 'center';

/** `→` で進む順。`←` はこの逆順。 */
export const WINDOW_POSITIONS: readonly WindowPosition[] = [
  'bottomRight',
  'topRight',
  'bottomLeft',
  'topLeft',
  'center',
];

/** フッタのメッセージに出す名前。 */
export const WINDOW_POSITION_LABELS: Readonly<Record<WindowPosition, string>> = {
  bottomRight: '右下',
  topRight: '右上',
  bottomLeft: '左下',
  topLeft: '左上',
  center: '中央',
};

/** 範囲に収める。作業領域より大きいときは始点（左端・上端）を優先する。 */
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

/** 大きさを保ったまま、作業領域の中で `position` に置いたときの位置と大きさを返す。 */
export const positionedBounds = (
  position: WindowPosition,
  current: Rectangle,
  workArea: Rectangle,
): Rectangle => {
  const { width, height } = current;
  const left = workArea.x;
  const top = workArea.y;
  const right = workArea.x + workArea.width - width;
  const bottom = workArea.y + workArea.height - height;

  const [x, y] = (() => {
    switch (position) {
      case 'bottomRight':
        return [right, bottom];
      case 'topRight':
        return [right, top];
      case 'bottomLeft':
        return [left, bottom];
      case 'topLeft':
        return [left, top];
      case 'center':
        return [
          workArea.x + Math.round((workArea.width - width) / 2),
          workArea.y + Math.round((workArea.height - height) / 2),
        ];
    }
  })();

  return { x: clamp(x, left, right), y: clamp(y, top, bottom), width, height };
};

/** いまのウィンドウがどの位置に置かれているか。どこにも当てはまらなければ undefined。 */
export const currentWindowPosition = (
  current: Rectangle,
  workArea: Rectangle,
): WindowPosition | undefined =>
  WINDOW_POSITIONS.find((position) => {
    const placed = positionedBounds(position, current, workArea);
    return placed.x === current.x && placed.y === current.y;
  });

/**
 * 次に置く位置を返す。`step` が 1 なら `→`（右下 → 右上 → 左下 → 左上 → 中央 → 右下 …）、-1 なら `←`。
 *
 * 位置は覚えておかず、いまのウィンドウの位置から決める。手で動かしたあとに押したときは、
 * `→` なら最初（右下）、`←` なら最後（中央）から始める。
 */
export const nextWindowPosition = (
  current: Rectangle,
  workArea: Rectangle,
  step: 1 | -1,
): WindowPosition => {
  const count = WINDOW_POSITIONS.length;
  const placed = currentWindowPosition(current, workArea);
  if (placed === undefined) {
    return WINDOW_POSITIONS[step === 1 ? 0 : count - 1] ?? 'bottomRight';
  }
  const index = WINDOW_POSITIONS.indexOf(placed);
  return WINDOW_POSITIONS[(index + step + count) % count] ?? 'bottomRight';
};

/** renderer から届いた向きとして使える値か。 */
export const toWindowStep = (value: unknown): 1 | -1 => (value === -1 ? -1 : 1);
