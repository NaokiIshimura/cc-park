import type { CharacterState } from '../types/agent.js';

/**
 * キャラクターの見た目定義。TUI / GUI の双方から参照する UI 非依存の共有資産。
 *
 * Claude Code の起動バナーと同じブロックアートを使う。
 * レイアウトを揺らさないため、全フレームは 3 行・表示幅 9 桁に揃えている。
 * 使用する Block Elements（U+2580-U+259F）は Menlo / SF Mono の双方に収録されており、
 * 字送り幅が ASCII と同じであることを `cmap` / `hmtx` の実測で確認済み。
 */
export const CHARACTER_HEIGHT = 3;
export const CHARACTER_WIDTH = 9;

/** 頭の行の中央（桁 1-7）。両端の桁 0 / 8 には手が入る。 */
const HEAD = '▐▛███▛█';

/** 身体の行（桁 0-8）。全フレーム共通。 */
export const BODY = '▝▜██████▀';

/** 足の行（桁 0-8）。起動バナーと同じ形で、状態によらず静止させる。 */
export const LEGS = '  ▝▝ ▝▝  ';

/** 停止済みは足を消す。 */
const NO_LEGS = '         ';

/** 未知の状態は足を不揃いにする。 */
const UNEVEN_LEGS = '  ▘▝ ▝▘  ';

/**
 * 手の高さ。動きはすべてこの手で表し、足は動かさない。
 *
 * 左右で鏡像にはできず、どちらもセルの**右**半分を使う。
 * 桁 0 は身体の `▝`（右半分）の真上に乗せる必要があり、
 * 桁 8 を左半分（`▖` `▌`）にすると隣の `█` と横に隣接して頭とくっついてしまう。
 * 右半分に寄せれば、身体とは縦に繋がったまま頭との間に 1 ピクセル空く。
 */
type HandPose = 'down' | 'low' | 'high';
const HAND: Readonly<Record<HandPose, string>> = { down: ' ', low: '▗', high: '▐' };

/** 手の高さと足の形から 1 フレームを組み立てる。 */
const frame = (left: HandPose, right: HandPose, legs: string = LEGS): string =>
  `${HAND[left]}${HEAD}${HAND[right]}\n${BODY}\n${legs}`;

export interface CharacterAppearance {
  /** アニメーションフレーム（各要素は改行区切りの 3 行） */
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

/*
 * 動くのは「作業中」と「こちらの操作待ち」だけ。
 * 動いている行だけを見れば済むよう、それ以外は 1 フレームで静止させる。
 */
export const CHARACTERS: Readonly<Record<CharacterState, CharacterAppearance>> = {
  blocked: {
    // 両手を大きく上下させて呼ぶ
    frames: [frame('down', 'down'), frame('high', 'high')],
    color: 'yellow',
    label: 'BLOCKED',
    description: 'needs your approval',
    priority: 0,
  },
  justFinished: {
    // 両手を上げたまま揺らして喜ぶ
    frames: [frame('low', 'low'), frame('high', 'high')],
    color: 'greenBright',
    label: 'DONE!',
    description: 'just finished - your turn',
    priority: 1,
  },
  working: {
    // 左右の手を交互に振る
    frames: [
      frame('high', 'down'),
      frame('down', 'down'),
      frame('down', 'high'),
      frame('down', 'down'),
    ],
    color: 'cyan',
    label: 'BUSY',
    description: 'working...',
    priority: 2,
  },
  waiting: {
    frames: [frame('down', 'down')],
    color: 'gray',
    label: 'IDLE',
    description: 'waiting for input',
    priority: 3,
  },
  done: {
    frames: [frame('down', 'down')],
    color: 'green',
    label: 'DONE',
    description: 'completed',
    priority: 4,
  },
  stopped: {
    frames: [frame('down', 'down', NO_LEGS)],
    color: 'gray',
    label: 'STOPPED',
    description: 'stopped',
    priority: 5,
  },
  unknown: {
    frames: [frame('down', 'down', UNEVEN_LEGS)],
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
