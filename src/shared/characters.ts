import type { CharacterState } from '../types/agent.js';

/**
 * キャラクターの見た目定義。TUI / GUI の双方から参照する UI 非依存の共有資産。
 *
 * レイアウトを揺らさないため、全フレームは 2 行・表示幅 8 桁に揃えている
 * （端末差で崩れないよう ASCII と幅の安定した記号のみを使う）。
 */
export const CHARACTER_HEIGHT = 2;
export const CHARACTER_WIDTH = 8;

/**
 * 頭（耳）の行。顔の括弧と桁が揃うよう全フレームで共通にする。
 * ポーズごとに書き分けるとずれるため、定数から組み立てる。
 */
export const HEAD = '( \\_/)  ';

/** 顔の行から 1 フレームを組み立てる。 */
const frame = (face: string): string => `${HEAD}\n${face}`;

export interface CharacterAppearance {
  /** アニメーションフレーム（各要素は改行区切りの 2 行） */
  readonly frames: readonly string[];
  /** 色名（Ink の color 名。GUI では CSS 変数へ対応付ける） */
  readonly color: string;
  /** 一覧に出すステータスラベル */
  readonly label: string;
  /** 状態の説明文 */
  readonly description: string;
  /** ソート優先度（小さいほど上に出る） */
  readonly priority: number;
}

export const CHARACTERS: Readonly<Record<CharacterState, CharacterAppearance>> = {
  blocked: {
    frames: [frame('( oAo)! '), frame('( oAo)  ')],
    color: 'yellow',
    label: 'BLOCKED',
    description: 'needs your approval',
    priority: 0,
  },
  justFinished: {
    frames: [frame('( ^v^)* '), frame('( ^v^) *')],
    color: 'greenBright',
    label: 'DONE!',
    description: 'just finished - your turn',
    priority: 1,
  },
  working: {
    frames: [frame('( -v-)/ '), frame('( ovo)_ '), frame('( -v-)\\ '), frame('( ovo)_ ')],
    color: 'cyan',
    label: 'BUSY',
    description: 'working...',
    priority: 2,
  },
  waiting: {
    frames: [frame('( -v-)z '), frame('( -v-)zZ')],
    color: 'gray',
    label: 'IDLE',
    description: 'waiting for input',
    priority: 3,
  },
  done: {
    frames: [frame('( ^v^)+ ')],
    color: 'green',
    label: 'DONE',
    description: 'completed',
    priority: 4,
  },
  stopped: {
    frames: [frame('( xvx)  ')],
    color: 'gray',
    label: 'STOPPED',
    description: 'stopped',
    priority: 5,
  },
  unknown: {
    frames: [frame('( ?v?)? ')],
    color: 'red',
    label: 'UNKNOWN',
    description: 'unknown state',
    priority: 6,
  },
};

/** 状態に対応する見た目を取得する。 */
export const getAppearance = (state: CharacterState): CharacterAppearance =>
  CHARACTERS[state] ?? CHARACTERS.unknown;

/** 状態とフレーム番号から描画する AA を取得する。 */
export const getFrame = (state: CharacterState, frame: number): string => {
  const { frames } = getAppearance(state);
  const index = ((frame % frames.length) + frames.length) % frames.length;
  return frames[index] ?? frames[0] ?? '';
};
