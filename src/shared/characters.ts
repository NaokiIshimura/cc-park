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

/*
 * 歩くときの足。足は桁 2 / 3（右足）と桁 5 / 6（左足）に 2 本ずつある。
 * 左右はキャラクター自身から見た向きで、手と同じく正面を向いているため入れ替わる。
 * 「開く」はペアの手前、「閉じる」は奥の足が半セルぶん動く。
 */
const LEGS_RIGHT_OPEN = '  ▘▝ ▝▝  ';
const LEGS_RIGHT_CLOSED = '  ▝▘ ▝▝  ';
const LEGS_LEFT_OPEN = '  ▝▝ ▘▝  ';
const LEGS_LEFT_CLOSED = '  ▝▝ ▝▘  ';

/** 未知の状態は足を不揃いにする。 */
const UNEVEN_LEGS = '  ▘▝ ▝▘  ';

/**
 * 上げた手。左右とも身体の端（桁 0 の `▝` と桁 8 の `▀`）の真上に乗るよう、
 * セルの右下を使う。
 *
 * 左右で鏡像にはできない。桁 0 の身体は右半分しか無いので手も右半分に置く必要があり、
 * 桁 8 を左半分（`▖` `▌`）にすると隣の `█` と横に隣接して頭とくっついてしまう。
 */
const RAISED = '▗';
const LOWERED = ' ';

/**
 * 手のポーズ。
 *
 * 左右はキャラクター自身から見た向き。正面を向いているため、
 * 桁 0（向かって左）が右手、桁 8（向かって右）が左手になる。
 */
type Pose = 'down' | 'rightHand' | 'leftHand' | 'both';

/** ポーズと足の形から 1 フレームを組み立てる。 */
const frame = (pose: Pose, legs: string = LEGS): string => {
  const rightHand = pose === 'rightHand' || pose === 'both' ? RAISED : LOWERED;
  const leftHand = pose === 'leftHand' || pose === 'both' ? RAISED : LOWERED;
  return `${rightHand}${HEAD}${leftHand}\n${BODY}\n${legs}`;
};

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
 *
 * 動かす部位で役割を分けている。
 * こちらの操作を待つ `blocked` / `justFinished` は手、作業中の `working` は足。
 */
export const CHARACTERS: Readonly<Record<CharacterState, CharacterAppearance>> = {
  blocked: {
    // 右手を上げ下げして呼ぶ
    frames: [frame('rightHand'), frame('down')],
    color: 'yellow',
    label: 'BLOCKED',
    description: 'needs your approval',
    priority: 0,
  },
  justFinished: {
    // 両手を上げ下げして喜ぶ
    frames: [frame('down'), frame('both')],
    color: 'greenBright',
    label: 'DONE!',
    description: 'just finished - your turn',
    priority: 1,
  },
  working: {
    // 手は下ろしたまま、右足 → 左足 の順に開いて閉じて歩く
    frames: [
      frame('down', LEGS_RIGHT_OPEN),
      frame('down'),
      frame('down', LEGS_RIGHT_CLOSED),
      frame('down'),
      frame('down', LEGS_LEFT_OPEN),
      frame('down'),
      frame('down', LEGS_LEFT_CLOSED),
      frame('down'),
    ],
    color: 'cyan',
    label: 'BUSY',
    description: 'working...',
    priority: 2,
  },
  waiting: {
    frames: [frame('down')],
    color: 'gray',
    label: 'IDLE',
    description: 'waiting for input',
    priority: 3,
  },
  done: {
    frames: [frame('down')],
    color: 'green',
    label: 'DONE',
    description: 'completed',
    priority: 4,
  },
  stopped: {
    frames: [frame('down')],
    color: 'gray',
    label: 'STOPPED',
    description: 'stopped',
    priority: 5,
  },
  unknown: {
    frames: [frame('down', UNEVEN_LEGS)],
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
