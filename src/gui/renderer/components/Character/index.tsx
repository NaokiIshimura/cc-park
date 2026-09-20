import type { CharacterState } from '../../../../types/agent.js';
import { getAppearance, getFrame } from '../../../../shared/characters.js';
import { inkColor } from '../../colors.js';

interface CharacterProps {
  readonly state: CharacterState;
  readonly frame: number;
}

/**
 * 状態とフレーム番号から AA を描画する。
 * 桁が崩れないよう等幅フォント＋`white-space: pre`（CSS 側で指定）で出す。
 */
export const Character = ({ state, frame }: CharacterProps) => (
  <pre className="character" style={{ color: inkColor(getAppearance(state).color) }}>
    {getFrame(state, frame)}
  </pre>
);
