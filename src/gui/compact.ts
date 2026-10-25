import type { CompactMode } from '../shared/compactSettings.js';
import { UNKNOWN_CWD_LABEL } from '../shared/groupAgents.js';

/**
 * ミニ表示（ウィンドウを AA のタイルだけに畳む表示）の判断。
 *
 * main（ウィンドウの位置・大きさ）と renderer（いつ畳むか）の双方から使うため、
 * Node / DOM のどちらにも依存しない純粋関数だけを置く。
 */

/**
 * ミニ表示にするかを返す。
 *
 * セッションの状態では切り替えない（要対応になっても畳んだまま）。
 * 予約 / 設定画面・確認ダイアログ・取得エラーはミニ表示に描けないため、出ている間（interrupted）だけ通常表示にする。
 */
export const shouldCompact = (mode: CompactMode, interrupted: boolean): boolean =>
  mode === 'on' && !interrupted;

/**
 * ミニ表示の見出しに出すディレクトリ名。
 * タイルの幅（AA の幅）しか取れないため、パス全体ではなく末尾のディレクトリ名だけにする。
 */
export const directoryName = (cwd: string): string => {
  if (cwd === '') {
    return UNKNOWN_CWD_LABEL;
  }
  const name = cwd.replace(/\/+$/, '').split('/').pop() ?? '';
  // 末尾の `/` を除くと空になるのはルートだけ
  return name === '' ? '/' : name;
};

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rectangle extends Size {
  readonly x: number;
  readonly y: number;
}

/** renderer から届いた寸法として使える値か。0 以下や非数は大きさにできない。 */
export const isValidSize = (value: unknown): value is Size => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { width, height } = value as Partial<Record<keyof Size, unknown>>;
  return (
    typeof width === 'number' &&
    typeof height === 'number' &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  );
};

/**
 * 大きさを変えたあとのウィンドウの位置を返す。
 *
 * 左上を固定すると、画面の右端に寄せて置いたウィンドウが広げたときにはみ出す。
 * そこで中心が作業領域の右半分にあれば右端を、下半分にあれば下端を固定し、
 * 置いた側の端からずれないようにする。最後に作業領域の内側へ収める。
 */
export const anchoredBounds = (current: Rectangle, size: Size, workArea: Rectangle): Rectangle => {
  const centerX = current.x + current.width / 2;
  const centerY = current.y + current.height / 2;
  const right = centerX > workArea.x + workArea.width / 2;
  const bottom = centerY > workArea.y + workArea.height / 2;

  const x = right ? current.x + current.width - size.width : current.x;
  const y = bottom ? current.y + current.height - size.height : current.y;

  return {
    x: clamp(x, workArea.x, workArea.x + workArea.width - size.width),
    y: clamp(y, workArea.y, workArea.y + workArea.height - size.height),
    width: size.width,
    height: size.height,
  };
};

/** 範囲に収める。作業領域より大きいときは始点（左端・上端）を優先する。 */
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));
