import { Box } from 'ink';
import { useCallback, useMemo, useState } from 'react';
import { AgentList, ROWS_PER_AGENT, sortAgents } from './components/AgentList/index.js';
import { ErrorView } from './components/ErrorView/index.js';
import { Footer } from './components/Footer/index.js';
import { Header } from './components/Header/index.js';
import { useAgents } from './hooks/useAgents.js';
import { useAnimationTick } from './hooks/useAnimationTick.js';
import { useNotifications } from './hooks/useNotifications.js';
import { useSelection } from './hooks/useSelection.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useTransitions } from './hooks/useTransitions.js';

/** アニメーションのフレーム更新間隔。ポーリング間隔とは独立させる。 */
const ANIMATION_INTERVAL_MS = 200;

/** 情報カラム以外が占める幅（左右 padding + カーソル + キャラクター + 余白） */
const FIXED_COLUMNS_WIDTH = 13;

/** 情報カラムの最小幅 */
const MIN_INFO_WIDTH = 20;

/**
 * 一覧以外が使う行数（ヘッダ 1 + 一覧の上下 padding 2 + フッタ 3 + はみ出し表示 2）。
 * 端末の高さを超えるとスクロールバックへ流れてしまうため、多めに確保する。
 */
const CHROME_ROWS = 8;

/** 端末が極端に低くても最低 1 件は出す */
const MIN_VISIBLE_AGENTS = 1;

/** 端末の高さから同時に表示できるセッション数を求める。 */
export const computeMaxVisible = (rows: number, chromeRows = CHROME_ROWS): number => {
  const available = rows - chromeRows;
  // N 件は 2N + (N-1) = 3N-1 行を占める
  return Math.max(Math.floor((available + 1) / ROWS_PER_AGENT), MIN_VISIBLE_AGENTS);
};

export interface AppProps {
  readonly intervalMs: number;
  readonly all: boolean;
  readonly cwd: string | undefined;
  readonly notify: boolean;
  readonly highlightMs: number;
  /** false の場合はポーリングとキー入力を行わない（--once / 非 TTY） */
  readonly interactive: boolean;
  readonly selfSessionId: string | null;
  readonly platform: NodeJS.Platform;
}

export const App = ({
  intervalMs,
  all,
  cwd,
  notify,
  highlightMs,
  interactive,
  selfSessionId,
  platform,
}: AppProps) => {
  const notifySupported = platform === 'darwin';
  const [notifyEnabled, setNotifyEnabled] = useState(notify && notifySupported);

  const { columns, rows } = useTerminalSize();
  const infoWidth = Math.max(columns - FIXED_COLUMNS_WIDTH, MIN_INFO_WIDTH);
  const maxVisible = computeMaxVisible(rows);

  const frame = useAnimationTick(ANIMATION_INTERVAL_MS, interactive);
  // フレーム更新に合わせて経過時間の基準時刻も進める
  const now = useMemo(() => Date.now(), [frame]);

  const { agents, previousAgents, error, lastUpdatedAt, isFetching, refresh } = useAgents({
    intervalMs,
    all,
    cwd,
    poll: interactive,
  });

  const { agents: decorated, transitions } = useTransitions(agents, previousAgents, {
    highlightMs,
    now,
  });

  useNotifications(transitions, { enabled: notifyEnabled });

  const sorted = useMemo(() => sortAgents(decorated), [decorated]);

  // 切り替え後の状態を返し、フッタのメッセージに使わせる
  const toggleNotify = useCallback(() => {
    const next = !notifyEnabled;
    setNotifyEnabled(next);
    return next;
  }, [notifyEnabled]);

  const { selectedIndex, message } = useSelection({
    agents: sorted,
    onRefresh: refresh,
    onToggleNotify: toggleNotify,
    notifySupported,
    enabled: interactive,
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header
        count={sorted.length}
        lastUpdatedAt={lastUpdatedAt}
        notifyEnabled={notifyEnabled}
        isFetching={isFetching}
      />

      {error === null ? (
        <AgentList
          agents={sorted}
          frame={frame}
          selectedIndex={selectedIndex}
          now={now}
          selfSessionId={selfSessionId}
          infoWidth={infoWidth}
          maxVisible={maxVisible}
        />
      ) : (
        <ErrorView error={error} />
      )}

      {interactive ? (
        <Footer message={message} showPlatformNotice={!notifySupported} />
      ) : null}
    </Box>
  );
};
