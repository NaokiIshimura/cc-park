import { describe, expect, it } from 'vitest';
import type { CharacterState } from '../types/agent.js';
import {
  attentionTitle,
  attentionTooltip,
  attentionTotal,
  countAttention,
  DEFAULT_ATTENTION_SETTINGS,
  NO_ATTENTION,
  sameAttention,
  toAttentionCounts,
  toAttentionSettings,
} from './attention.js';

const of = (...states: CharacterState[]) => states.map((state) => ({ state }));

describe('countAttention', () => {
  it('BLOCKED と DONE! だけを数える', () => {
    expect(
      countAttention(
        of('blocked', 'justFinished', 'blocked', 'working', 'waiting', 'done', 'stopped', 'unknown'),
      ),
    ).toEqual({ blocked: 2, finished: 1 });
  });

  it('空なら 0 件', () => {
    expect(countAttention([])).toEqual(NO_ATTENTION);
  });
});

describe('attentionTotal / sameAttention', () => {
  it('合計を返す', () => {
    expect(attentionTotal({ blocked: 2, finished: 3 })).toBe(5);
  });

  it('内訳まで同じときだけ同じとみなす', () => {
    expect(sameAttention({ blocked: 1, finished: 1 }, { blocked: 1, finished: 1 })).toBe(true);
    expect(sameAttention({ blocked: 2, finished: 0 }, { blocked: 1, finished: 1 })).toBe(false);
  });
});

describe('attentionTitle', () => {
  it('0 件なら文字を出さない', () => {
    expect(attentionTitle(NO_ATTENTION)).toBe('');
  });

  it('合計を出す', () => {
    expect(attentionTitle({ blocked: 1, finished: 2 })).toBe('3');
  });
});

describe('attentionTooltip', () => {
  it('0 件のときはその旨を出す', () => {
    expect(attentionTooltip(NO_ATTENTION)).toBe('CC Park: 操作待ちのセッションはありません');
  });

  it('内訳を出す', () => {
    expect(attentionTooltip({ blocked: 1, finished: 2 })).toBe(
      'CC Park: 承認待ち 1 / 作業完了 2',
    );
  });
});

describe('toAttentionCounts', () => {
  it('正しい値はそのまま使う', () => {
    expect(toAttentionCounts({ blocked: 1, finished: 2 })).toEqual({ blocked: 1, finished: 2 });
  });

  it('0 以上の整数でない項目は 0 にする', () => {
    expect(toAttentionCounts({ blocked: -1, finished: 1.5 })).toEqual(NO_ATTENTION);
    expect(toAttentionCounts({ blocked: '1' })).toEqual(NO_ATTENTION);
  });

  it('オブジェクト以外は 0 件', () => {
    expect(toAttentionCounts(null)).toEqual(NO_ATTENTION);
    expect(toAttentionCounts(3)).toEqual(NO_ATTENTION);
  });
});

describe('toAttentionSettings', () => {
  it('既定ではバッジもメニューバーも出す', () => {
    expect(DEFAULT_ATTENTION_SETTINGS).toEqual({ dockBadge: true, tray: true });
  });

  it('正しい値はそのまま使う', () => {
    expect(toAttentionSettings({ dockBadge: false, tray: false })).toEqual({
      dockBadge: false,
      tray: false,
    });
  });

  it('解釈できない項目だけ既定値で埋める', () => {
    expect(toAttentionSettings({ dockBadge: 0, tray: false })).toEqual({
      dockBadge: true,
      tray: false,
    });
  });

  it('オブジェクト以外は既定値', () => {
    expect(toAttentionSettings(undefined)).toEqual(DEFAULT_ATTENTION_SETTINGS);
  });
});
