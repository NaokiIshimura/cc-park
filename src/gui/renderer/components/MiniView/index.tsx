import { useLayoutEffect, useRef } from 'react';
import type { Agent } from '../../../../types/agent.js';
import { getAppearance } from '../../../../shared/characters.js';
import { formatCwd } from '../../../../shared/formatCwd.js';
import type { AgentGroup } from '../../../../shared/groupAgents.js';
import { directoryName, type Size } from '../../../compact.js';
import { Character } from '../Character/index.js';

/** 見出しのツールチップに出す cwd の最大文字数。一覧の見出しと揃える。 */
const CWD_MAX_WIDTH = 60;

interface MiniViewProps {
  /** 一覧と同じグループ構成 */
  readonly groups: readonly AgentGroup[];
  readonly frame: number;
  readonly home: string;
  /** ミニ表示をやめて通常表示へ戻す */
  readonly onExpand: () => void;
  /** 描画した内容の大きさ。ウィンドウをこの大きさに合わせる */
  readonly onResize: (size: Size) => void;
}

/** タイルのツールチップ。名前を省略表示しても、状態とあわせて確かめられるようにする。 */
const tileTitle = (agent: Agent): string => {
  const { label, description } = getAppearance(agent.state);
  return `${agent.name}\n${label} ${description}`;
};

/**
 * ミニ表示。ディレクトリ名の見出しと、AA と名前だけのタイルを縦 1 列に並べる。
 *
 * 手・足の動きだけで作業中か操作待ちかは分かるので、情報を削っても目的は保てる。
 * 横に置いておく使い方が主なので幅を AA 1 体ぶんに保ち、件数が増えたら縦に伸ばす。
 * 状態を眺めるための表示なので、タイルは選択できない（操作は `開く` で通常表示へ戻してから行う）。
 * 内容の大きさは AA のフォントで決まるため、描画のたびに実測して通知する。
 */
export const MiniView = ({ groups, frame, home, onExpand, onResize }: MiniViewProps) => {
  const ref = useRef<HTMLDivElement>(null);
  // 同じ大きさを送り直すと、ウィンドウの変更と実測が往復し続けるため差分だけ送る
  const lastSize = useRef<Size | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }

    const report = () => {
      const { width, height } = element.getBoundingClientRect();
      const last = lastSize.current;
      if (last !== null && last.width === width && last.height === height) {
        return;
      }
      lastSize.current = { width, height };
      onResize({ width, height });
    };

    report();
    // フォントの読み込みや名前の変化で大きさが変わったときにも追従する
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [onResize]);

  return (
    <div ref={ref} className="mini-view">
      {groups.length === 0 ? (
        <p className="mini-view__empty">no sessions</p>
      ) : (
        <ul className="mini-view__groups" aria-label="セッション一覧">
          {groups.map((group) => (
            <li key={group.cwd} className="mini-group">
              <h2
                className="mini-group__header"
                title={group.cwd === '' ? undefined : formatCwd(group.cwd, CWD_MAX_WIDTH, home)}
              >
                {directoryName(group.cwd)}
              </h2>

              <ul className="mini-group__tiles">
                {group.agents.map((agent) => (
                  <li key={agent.sessionId} className="mini-tile" title={tileTitle(agent)}>
                    <Character state={agent.state} frame={frame} />
                    <span className="mini-tile__name">{agent.name}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="button mini-view__expand"
        title="ミニ表示をやめて一覧を開く"
        onClick={onExpand}
      >
        開く
      </button>
    </div>
  );
};
