import { useCallback, useEffect, useRef } from 'react';
import type { Size } from '../../compact.js';
import type { CcParkBridge } from '../../ipc.js';

export interface UseCompactOptions {
  readonly bridge: Pick<CcParkBridge, 'setCompact'>;
  /** ミニ表示にしているか */
  readonly compact: boolean;
}

export interface UseCompactResult {
  /** ミニ表示の内容の大きさを受け取り、ウィンドウをその大きさに合わせる */
  readonly reportSize: (size: Size) => void;
}

/**
 * ミニ表示の切り替えに合わせて、ウィンドウの大きさを main に変えさせる。
 *
 * 畳むときの大きさはミニ表示が実測して `reportSize` で渡し、
 * 通常表示へ戻ったら畳む前の大きさに戻させる。
 */
export const useCompact = ({ bridge, compact }: UseCompactOptions): UseCompactResult => {
  // 一度も畳んでいなければ、戻す依頼を main へ送らずに済ませる
  const applied = useRef(false);

  useEffect(() => {
    if (!compact && applied.current) {
      applied.current = false;
      void bridge.setCompact(false, null);
    }
  }, [compact, bridge]);

  const reportSize = useCallback(
    (size: Size) => {
      applied.current = true;
      void bridge.setCompact(true, size);
    },
    [bridge],
  );

  return { reportSize };
};
