import { Box } from 'ink';
import { useCallback, useMemo, useState } from 'react';
import {
  AgentList,
  ROWS_PER_AGENT,
  ROWS_PER_GROUP_HEADER,
} from './components/AgentList/index.js';
import { fetchAgents } from './core/fetchAgents.js';
// props の notify（有効フラグ）と名前が衝突するため別名で受ける
import { notify as osNotify } from './core/notify.js';
import { ErrorView } from './components/ErrorView/index.js';
import { Footer } from './components/Footer/index.js';
import { Header } from './components/Header/index.js';
import { flattenGroups, groupAgents } from './shared/groupAgents.js';
import { useAgents } from './hooks/useAgents.js';
import { useAnimationTick } from './hooks/useAnimationTick.js';
import { useNotifications } from './hooks/useNotifications.js';
import { useSelection } from './hooks/useSelection.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useTransitions } from './hooks/useTransitions.js';

/** アニメーションのフレーム更新間隔。ポーリング間隔とは独立させる。 */
const ANIMATION_INTERVAL_MS = 200;

/** 情報カラム以外が占める幅（左右 padding + カーソル + キャラクター + 余白） */
const FIXED_COLUMNS_WIDTH = 14;

/** グループ見出しの左右に空ける余白 */
const HEADER_PADDING_WIDTH = 2;

/** 情報カラムの最小幅 */
const MIN_INFO_WIDTH = 20;

/**
 * 一覧以外が使う行数（ヘッダ 1 + 一覧の上下 padding 2 + フッタ 3 + はみ出し表示 2）。
 * 端末の高さを超えるとスクロールバックへ流れてしまうため、多めに確保する。
 */
const CHROME_ROWS = 8;

/** 端末が極端に低くても最低 1 件は出す */
const MIN_VISIBLE_AGENTS = 1;

/**
 * 端末の高さから同時に表示できるセッション数を求める。
 * グループ見出しも行を消費するため、グループ数ぶんを先に差し引く。
 */
export const computeMaxVisible = (
  rows: number,
  groupCount = 0,
  chromeRows = CHROME_ROWS,
): number => {
  const available = rows - chromeRows - groupCount * ROWS_PER_GROUP_HEADER;
  // N 件は 3N + (N-1) = 4N-1 行を占める
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
  /** 最後に与えたプロンプトを表示する */
  readonly prompt?: boolean;
  /** コンテキスト利用率を表示する */
  readonly tokens?: boolean;
  /** コンテキスト上限の明示指定。0 なら使用量から推定する */
  readonly contextLimit?: number;
  /** セッション取得の実装。既定は `claude agents --json` の実行 */
  readonly fetcher?: typeof fetchAgents;
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
  prompt = false,
  tokens = false,
  contextLimit = 0,
  fetcher = fetchAgents,
}: AppProps) => {
  const notifySupported = platform === 'darwin';
  const [notifyEnabled, setNotifyEnabled] = useState(notify && notifySupported);

  const { columns, rows } = useTerminalSize();
  const infoWidth = Math.max(columns - FIXED_COLUMNS_WIDTH, MIN_INFO_WIDTH);
  const headerWidth = Math.max(columns - HEADER_PADDING_WIDTH, MIN_INFO_WIDTH);

  const frame = useAnimationTick(ANIMATION_INTERVAL_MS, interactive);
  // フレーム更新に合わせて経過時間の基準時刻も進める
  const now = useMemo(() => Date.now(), [frame]);

  const { agents, previousAgents, error, lastUpdatedAt, isFetching, refresh } = useAgents({
    intervalMs,
    all,
    cwd,
    poll: interactive,
    fetcher,
    meta: prompt || tokens,
    contextLimit: contextLimit === 0 ? undefined : contextLimit,
  });

  const { agents: decorated, transitions } = useTransitions(agents, previousAgents, {
    highlightMs,
    now,
  });

  useNotifications(transitions, { enabled: notifyEnabled, notifier: osNotify });

  // 描画は cwd ごとのグループ、選択はフラットな添字。順序を必ず一致させる
  const groups = useMemo(() => groupAgents(decorated), [decorated]);
  const sorted = useMemo(() => flattenGroups(groups), [groups]);
  const maxVisible = computeMaxVisible(rows, groups.length);

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
          headerWidth={headerWidth}
          showPrompt={prompt}
          showTokens={tokens}
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
