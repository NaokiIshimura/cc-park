import { useEffect, useState } from 'react';

/**
 * アニメーション用のフレームカウンタ。
 *
 * ポーリング間隔とは独立させることで、外部コマンドの実行頻度を上げずに
 * キャラクターだけを滑らかに動かす。
 */
export const useAnimationTick = (intervalMs = 200, enabled = true): number => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const timer = setInterval(() => {
      setFrame((previous) => previous + 1);
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs, enabled]);

  return frame;
};
