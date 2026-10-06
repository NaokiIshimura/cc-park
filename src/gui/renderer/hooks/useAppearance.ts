import { useCallback, useEffect, useState } from 'react';
import type { Appearance } from '../../../shared/themes.js';
import type { CcParkBridge } from '../../ipc.js';
import { applyAppearance } from '../appearance.js';

/**
 * 見た目の設定を保持し、DOM へ反映する。
 *
 * 変更はその場で画面に反映してから main へ送り、main が実際に適用した値を正として持ち直す
 * （設定画面で選んだ瞬間に見た目が変わるようにするため）。
 */
export const useAppearance = (bridge: CcParkBridge, initial: Appearance) => {
  const [appearance, setAppearance] = useState(initial);

  useEffect(() => {
    applyAppearance(document.documentElement, appearance);
  }, [appearance]);

  const change = useCallback(
    async (next: Appearance) => {
      setAppearance(next);
      setAppearance(await bridge.setAppearance(next));
    },
    [bridge],
  );

  return { appearance, change };
};
