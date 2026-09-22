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

/** 足の行（桁 0-8）。起動バナーと同じ形。静止する状態と、`working` の開いたフレームで使う。 */
export const LEGS = '  ▝▝ ▝▝  ';

/*
 * 閉じたときの足。足は桁 2 / 3（右足）と桁 5 / 6（左足）に 2 本ずつある。
 * 左右はキャラクター自身から見た向きで、手と同じく正面を向いているため入れ替わる。
 *
 * サブエージェントのミニキャラクターと同じく、左右の足を同時に開閉させる。
 * 4 本まとめて半セルぶん中央へ寄せ、開くときは標準（`LEGS`）へ戻す。
 * 半セルより細かくは動かせないので、開いた形を標準そのものにして振り幅を抑えている。
 */
const LEGS_CLOSED = '   ▘▘▘▘  ';

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
    // 手は下ろしたまま、ミニキャラクターと同じく左右の足を閉じて開く（開いた形は標準）
    frames: [frame('down', LEGS_CLOSED), frame('down')],
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

/*
 * ミニキャラクター。実行中のサブエージェント 1 体を表す。
 *
 * 親の AA の下へ 1 行だけ並べるので、1 行 x 2 桁に収める。
 * 上半分が身体、下半分が足で、親と同じく左右の足を同時に開閉させる。
 * 動く部位を足に揃えることで、動いている = 作業中、という役割分担を崩さない。
 */

/** ミニキャラクター 1 体の桁数。 */
export const MINI_WIDTH = 2;

/** 体と体の間に空ける桁数。 */
const MINI_GAP = 1;

/** 足を開いた形（外向きに 1 本ずつ）と、閉じた形（中央で 1 本に繋がる）。 */
const MINI_FRAMES: readonly string[] = ['▛▜', '▜▛'];

/** フレーム番号からミニキャラクター 1 体を取り出す。負の番号でも循環させる。 */
export const getMiniFrame = (frame: number): string => {
  const index = ((frame % MINI_FRAMES.length) + MINI_FRAMES.length) % MINI_FRAMES.length;
  return MINI_FRAMES[index] ?? '';
};

/**
 * 表示幅に並ぶ体数。
 *
 * ミニキャラクターは行の幅いっぱいまで横に並べ、入りきらなくなったときだけ折り返す。
 * 幅がどれだけ狭くても 1 体は出す（0 にすると折り返しが終わらない）。
 */
export const miniPerRow = (width: number): number =>
  Math.max(Math.floor((width + MINI_GAP) / (MINI_WIDTH + MINI_GAP)), 1);

/** 実行中の体数を並べるのに要る行数。 */
export const countMiniRows = (count: number, perRow: number): number =>
  count <= 0 ? 0 : Math.ceil(count / Math.max(perRow, 1));

/**
 * ミニキャラクターが占める行数。折り返したときは行の間に空行を 1 つ入れる。
 * 端末の高さから表示件数を出すときに使う。
 */
export const countMiniHeight = (count: number, perRow: number): number => {
  const rows = countMiniRows(count, perRow);
  return rows === 0 ? 0 : rows * 2 - 1;
};

/**
 * 実行中のサブエージェントの数だけミニキャラクターを並べる。
 *
 * 省略はせず、走っている体数ぶんすべて出す。`perRow` 体で折り返す。
 * 位相は「行 + 列」でずらすので、横にも縦にも隣り合う体の足が揃うことはない。
 */
export const buildMiniRows = (
  count: number,
  frame: number,
  perRow: number,
): readonly string[] =>
  Array.from({ length: countMiniRows(count, perRow) }, (_, row) => {
    const first = row * perRow;
    const slots = Array.from({ length: Math.min(perRow, count - first) }, (_, column) =>
      getMiniFrame(frame + row + column),
    );
    return slots.join(' '.repeat(MINI_GAP));
  });

/** 状態に対応する見た目を取得する。 */
export const getAppearance = (state: CharacterState): CharacterAppearance =>
  CHARACTERS[state] ?? CHARACTERS.unknown;

/** 状態とフレーム番号から描画する AA を取得する。 */
export const getFrame = (state: CharacterState, frame: number): string => {
  const { frames } = getAppearance(state);
  const index = ((frame % frames.length) + frames.length) % frames.length;
  return frames[index] ?? frames[0] ?? '';
};
