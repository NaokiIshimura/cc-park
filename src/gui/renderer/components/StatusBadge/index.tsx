import type { CharacterState } from '../../../../types/agent.js';
import { getAppearance } from '../../../../shared/characters.js';
import { inkColor } from '../../colors.js';

interface StatusBadgeProps {
  readonly state: CharacterState;
}

/** 状態ラベルを固定幅で描画する。 */
export const StatusBadge = ({ state }: StatusBadgeProps) => {
  const { color, label } = getAppearance(state);
  return (
    <span className="status-badge" style={{ color: inkColor(color) }}>
      {label}
    </span>
  );
};
