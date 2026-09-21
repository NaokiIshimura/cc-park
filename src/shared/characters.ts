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

/**
 * Claude Code のマーク（上 2 行）。顔の代わりに全フレームで共通にする。
 * 状態ごとに書き分けるとずれるため、定数から組み立てる。
 */
export const MARK = ' ▐▛███▛█ \n▝▜██████▀';

/** 火花の行（3 行目）から 1 フレームを組み立てる。 */
const frame = (sparks: string): string => `${MARK}\n${sparks}`;

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
 * 足に使えるのは `▘`（左上） `▝`（右上） `▀`（上半分）と空白だけ。
 * `▗` `▖` のような下半分の文字はセルの下側に描かれるため、身体との間に
 * 半セルぶんの空白ができて足が浮いてしまう。
 * 動きは「左右の半セル移動」と「太さの変化」の 2 軸で作る。
 */
export const CHARACTERS: Readonly<Record<CharacterState, CharacterAppearance>> = {
  blocked: {
    // 足が太くなって点滅して見える
    frames: [frame('  ▝▝ ▝▝  '), frame('  ▀▀ ▀▀  ')],
    color: 'yellow',
    label: 'BLOCKED',
    description: 'needs your approval',
    priority: 0,
  },
  justFinished: {
    // 外側へ弾ける
    frames: [frame('  ▝▝ ▝▝  '), frame(' ▝▝   ▝▝ ')],
    color: 'greenBright',
    label: 'DONE!',
    description: 'just finished - your turn',
    priority: 1,
  },
  working: {
    // 太い足が左から右へ流れる
    frames: [
      frame('  ▀▝ ▝▝  '),
      frame('  ▝▀ ▝▝  '),
      frame('  ▝▝ ▀▝  '),
      frame('  ▝▝ ▝▀  '),
    ],
    color: 'cyan',
    label: 'BUSY',
    description: 'working...',
    priority: 2,
  },
  waiting: {
    // 入力待ちは動かさず、動いている＝作業中か要対応、と読めるようにする
    frames: [frame('  ▝▝ ▝▝  ')],
    color: 'gray',
    label: 'IDLE',
    description: 'waiting for input',
    priority: 3,
  },
  done: {
    frames: [frame('  ▝▝ ▝▝  ')],
    color: 'green',
    label: 'DONE',
    description: 'completed',
    priority: 4,
  },
  stopped: {
    // 足が消える
    frames: [frame('         ')],
    color: 'gray',
    label: 'STOPPED',
    description: 'stopped',
    priority: 5,
  },
  unknown: {
    // 不揃いのまま止まる
    frames: [frame('  ▘▝ ▝▘  ')],
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
