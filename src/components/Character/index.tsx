import { Text } from 'ink';
import type { CharacterState } from '../../types/agent.js';
import { getAppearance, getFrame } from './frames.js';

interface CharacterProps {
  readonly state: CharacterState;
  readonly frame: number;
  /** 選択行を目立たせるために太字で描画する */
  readonly bold?: boolean;
}

/**
 * 状態とフレーム番号から AA を描画するだけの純粋コンポーネント。
 * AA は読み取れることが最優先なので、未選択でも暗くしない。
 */
export const Character = ({ state, frame, bold = false }: CharacterProps) => (
  <Text color={getAppearance(state).color} bold={bold}>
    {getFrame(state, frame)}
  </Text>
);

export { CHARACTERS, CHARACTER_HEIGHT, CHARACTER_WIDTH, getAppearance, getFrame } from './frames.js';
export type { CharacterAppearance } from './frames.js';
