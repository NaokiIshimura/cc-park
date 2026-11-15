import { describe, expect, it } from 'vitest';
import {
  currentWindowPosition,
  nextWindowPosition,
  positionedBounds,
  toWindowStep,
  WINDOW_POSITIONS,
} from './windowPosition.js';

/** メニューバー（上 25px）と Dock（下 75px）を除いた作業領域。 */
const workArea = { x: 0, y: 25, width: 1440, height: 800 };
const size = { width: 360, height: 640 };
const at = (x: number, y: number) => ({ x, y, ...size });

describe('positionedBounds', () => {
  it('四隅は作業領域の端にぴったり付ける（大きさは変えない）', () => {
    expect(positionedBounds('bottomRight', at(100, 100), workArea)).toEqual(at(1080, 185));
    expect(positionedBounds('topRight', at(100, 100), workArea)).toEqual(at(1080, 25));
    expect(positionedBounds('bottomLeft', at(100, 100), workArea)).toEqual(at(0, 185));
    expect(positionedBounds('topLeft', at(100, 100), workArea)).toEqual(at(0, 25));
  });

  it('中央は作業領域の真ん中に置く', () => {
    expect(positionedBounds('center', at(100, 100), workArea)).toEqual(at(540, 105));
  });

  it('作業領域が原点以外から始まる画面（2 枚目のディスプレイ）でも、その中に置く', () => {
    const second = { x: -1920, y: 0, width: 1920, height: 1055 };
    expect(positionedBounds('topLeft', at(0, 0), second)).toEqual(at(-1920, 0));
    expect(positionedBounds('bottomRight', at(0, 0), second)).toEqual(at(-360, 415));
  });

  it('作業領域より大きいときは左上を優先して収める', () => {
    const small = { x: 0, y: 25, width: 300, height: 500 };
    expect(positionedBounds('bottomRight', at(100, 100), small)).toEqual(at(0, 25));
  });
});

describe('currentWindowPosition', () => {
  it('四隅・中央に置かれていればその位置を返す', () => {
    for (const position of WINDOW_POSITIONS) {
      const placed = positionedBounds(position, at(0, 0), workArea);
      expect(currentWindowPosition(placed, workArea)).toBe(position);
    }
  });

  it('手で動かした位置なら undefined', () => {
    expect(currentWindowPosition(at(123, 456), workArea)).toBeUndefined();
  });
});

describe('nextWindowPosition', () => {
  it('→ は 右下 → 右上 → 左下 → 左上 → 中央 → 右下 の順に進む', () => {
    const visited: string[] = [];
    let bounds = at(123, 456);
    for (let i = 0; i < 6; i += 1) {
      const position = nextWindowPosition(bounds, workArea, 1);
      visited.push(position);
      bounds = positionedBounds(position, bounds, workArea);
    }
    expect(visited).toEqual([
      'bottomRight',
      'topRight',
      'bottomLeft',
      'topLeft',
      'center',
      'bottomRight',
    ]);
  });

  it('← は逆順に戻る', () => {
    const topRight = positionedBounds('topRight', at(0, 0), workArea);
    expect(nextWindowPosition(topRight, workArea, -1)).toBe('bottomRight');
    const bottomRight = positionedBounds('bottomRight', at(0, 0), workArea);
    expect(nextWindowPosition(bottomRight, workArea, -1)).toBe('center');
  });

  it('手で動かしたあとは、→ なら右下、← なら中央から始める', () => {
    expect(nextWindowPosition(at(123, 456), workArea, 1)).toBe('bottomRight');
    expect(nextWindowPosition(at(123, 456), workArea, -1)).toBe('center');
  });
});

describe('toWindowStep', () => {
  it('-1 だけを ← として扱い、それ以外は → にする', () => {
    expect(toWindowStep(-1)).toBe(-1);
    expect(toWindowStep(1)).toBe(1);
    expect(toWindowStep('left')).toBe(1);
  });
});
