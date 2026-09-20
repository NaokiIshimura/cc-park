import { Text } from 'ink';
import type { CharacterState } from '../../types/agent.js';
import { getAppearance } from '../Character/index.js';

/** ステータスラベルの表示幅。行を揃えるため固定にする。 */
export const STATUS_LABEL_WIDTH = 8;

interface StatusBadgeProps {
  readonly state: CharacterState;
}

/** 状態ラベルを固定幅で描画する。 */
export const StatusBadge = ({ state }: StatusBadgeProps) => {
  const { color, label } = getAppearance(state);
  return (
    <Text color={color} bold>
      {label.padEnd(STATUS_LABEL_WIDTH)}
    </Text>
  );
};
