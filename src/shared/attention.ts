import type { CharacterState } from '../types/agent.js';

/**
 * こちらの操作を待っているセッションの件数。GUI の Dock バッジとメニューバーに出す。
 *
 * 数えるのは手を動かして知らせる状態（`BLOCKED` / `DONE!`）だけにする。
 * 「動いている部位を見れば作業中か操作待ちかが分かる」方針と揃え、
 * バッジの数字も「いま見に行くべき件数」だけを表す。
 */
export interface AttentionCounts {
  /** 承認待ち（`BLOCKED`） */
  readonly blocked: number;
  /** 作業完了の直後（`DONE!`） */
  readonly finished: number;
}

export const NO_ATTENTION: AttentionCounts = { blocked: 0, finished: 0 };

/** 一覧から操作待ちの件数を数える。 */
export const countAttention = (
  agents: readonly { readonly state: CharacterState }[],
): AttentionCounts => ({
  blocked: agents.filter((agent) => agent.state === 'blocked').length,
  finished: agents.filter((agent) => agent.state === 'justFinished').length,
});

export const attentionTotal = (counts: AttentionCounts): number =>
  counts.blocked + counts.finished;

export const sameAttention = (a: AttentionCounts, b: AttentionCounts): boolean =>
  a.blocked === b.blocked && a.finished === b.finished;

/** メニューバーのアイコン横に出す文字。0 件なら出さない（アイコンだけにする）。 */
export const attentionTitle = (counts: AttentionCounts): string => {
  const total = attentionTotal(counts);
  return total === 0 ? '' : String(total);
};

/** メニューバーのアイコンにマウスを載せたときの説明。 */
export const attentionTooltip = (counts: AttentionCounts): string =>
  attentionTotal(counts) === 0
    ? 'CC Park: 操作待ちのセッションはありません'
    : `CC Park: 承認待ち ${counts.blocked} / 作業完了 ${counts.finished}`;

/**
 * IPC で受け取った値を件数として解釈する。
 * renderer から来た値なので、0 以上の整数でない項目は 0 にする。
 */
export const toAttentionCounts = (value: unknown): AttentionCounts => {
  if (typeof value !== 'object' || value === null) {
    return NO_ATTENTION;
  }
  const { blocked, finished } = value as Partial<Record<keyof AttentionCounts, unknown>>;
  const toCount = (n: unknown): number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0;
  return { blocked: toCount(blocked), finished: toCount(finished) };
};

/** 件数をどこに出すか。設定画面で切り替え、`settings.json` に保存する。 */
export interface AttentionSettings {
  /** Dock（アプリのアイコン）にバッジで件数を出す */
  readonly dockBadge: boolean;
  /** メニューバーにアイコンを常駐させ、件数を出す */
  readonly tray: boolean;
}

/**
 * 既定ではどちらも出す。ウィンドウを隠していても操作待ちに気付けるようにするための機能で、
 * 要らなければ設定画面で消せる。
 */
export const DEFAULT_ATTENTION_SETTINGS: AttentionSettings = { dockBadge: true, tray: true };

/**
 * 保存ファイルや renderer から来た値を設定として解釈する。
 * 解釈できない項目は既定値で埋める（この設定を持たない古い保存ファイルは既定として読む）。
 */
export const toAttentionSettings = (value: unknown): AttentionSettings => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_ATTENTION_SETTINGS;
  }
  const { dockBadge, tray } = value as Partial<Record<keyof AttentionSettings, unknown>>;
  return {
    dockBadge: typeof dockBadge === 'boolean' ? dockBadge : DEFAULT_ATTENTION_SETTINGS.dockBadge,
    tray: typeof tray === 'boolean' ? tray : DEFAULT_ATTENTION_SETTINGS.tray,
  };
};
