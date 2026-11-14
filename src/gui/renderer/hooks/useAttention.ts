import { useCallback, useEffect, useRef, useState } from 'react';
import {
  countAttention,
  NO_ATTENTION,
  sameAttention,
  type AttentionCounts,
  type AttentionSettings,
} from '../../../shared/attention.js';
import type { CharacterState } from '../../../types/agent.js';
import type { CcParkBridge } from '../../ipc.js';

/**
 * 操作待ちの件数を main へ知らせ、Dock のバッジとメニューバーに出させる。
 *
 * `DONE!` は renderer の遷移検出で決まり、時間が経つと消えるので、件数も renderer で数える。
 * 一覧はアニメーションのたびに作り直されるため、件数が変わったときだけ送る。
 */
export const useAttentionReport = (
  bridge: CcParkBridge,
  agents: readonly { readonly state: CharacterState }[],
): void => {
  const reported = useRef<AttentionCounts>(NO_ATTENTION);

  useEffect(() => {
    const counts = countAttention(agents);
    if (sameAttention(counts, reported.current)) {
      return;
    }
    reported.current = counts;
    bridge.setAttention(counts);
  }, [agents, bridge]);
};

/**
 * 保存する設定を保持する。
 * 変更はその場で画面に反映してから main へ送り、main が保存した値を正として持ち直す。
 */
export const useSavedSetting = <T,>(initial: T, save: (next: T) => Promise<T>) => {
  const [settings, setSettings] = useState(initial);

  const change = useCallback(
    async (next: T) => {
      setSettings(next);
      setSettings(await save(next));
    },
    [save],
  );

  return { settings, change };
};

/** 件数の出し方の設定を保持する。 */
export const useAttentionSettings = (bridge: CcParkBridge, initial: AttentionSettings) =>
  useSavedSetting(initial, bridge.saveAttentionSettings);
