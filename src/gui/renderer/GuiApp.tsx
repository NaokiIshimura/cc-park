import { useCallback, useMemo, useState } from 'react';
import { useAgents } from '../../hooks/useAgents.js';
import { useAnimationTick } from '../../hooks/useAnimationTick.js';
import { useNotifications } from '../../hooks/useNotifications.js';
import { useTransitions } from '../../hooks/useTransitions.js';
import { sortAgents } from '../../shared/sortAgents.js';
import type { GuiConfig } from '../config.js';
import type { CcParkBridge } from '../ipc.js';
import { createBridgeFetcher } from './bridge.js';
import { AgentList } from './components/AgentList/index.js';
import { ErrorView } from './components/ErrorView/index.js';
import { Footer } from './components/Footer/index.js';
import { Header } from './components/Header/index.js';
import { ConfirmDialog } from './components/ConfirmDialog/index.js';
import { useGuiSelection } from './hooks/useGuiSelection.js';

/** アニメーションのフレーム更新間隔。ポーリング間隔とは独立させる。 */
const ANIMATION_INTERVAL_MS = 200;

export interface GuiAppProps {
  readonly config: GuiConfig;
  readonly bridge: CcParkBridge;
}

/** GUI のルート。TUI の App.tsx と同じ流れを DOM で組み立てる。 */
export const GuiApp = ({ config, bridge }: GuiAppProps) => {
  const [notifyEnabled, setNotifyEnabled] = useState(config.notify);
  const [alwaysOnTop, setAlwaysOnTop] = useState(config.alwaysOnTop);

  const frame = useAnimationTick(ANIMATION_INTERVAL_MS);
  // フレーム更新に合わせて経過時間の基準時刻も進める
  const now = useMemo(() => Date.now(), [frame]);

  const fetcher = useMemo(() => createBridgeFetcher(bridge), [bridge]);

  const { agents, previousAgents, error, lastUpdatedAt, isFetching, refresh } = useAgents({
    intervalMs: config.intervalMs,
    all: config.all,
    cwd: config.cwd,
    fetcher,
  });

  const { agents: decorated, transitions } = useTransitions(agents, previousAgents, {
    highlightMs: config.highlightMs,
    now,
  });

  useNotifications(transitions, { enabled: notifyEnabled, notifier: bridge.notify });

  const sorted = useMemo(() => sortAgents(decorated), [decorated]);

  // 切り替え後の状態を返し、フッタのメッセージに使わせる
  const toggleNotify = useCallback(() => {
    const next = !notifyEnabled;
    setNotifyEnabled(next);
    return next;
  }, [notifyEnabled]);

  // main プロセスが実際に適用できた値を正として保持する
  const applyAlwaysOnTop = useCallback(async () => {
    const applied = await bridge.setAlwaysOnTop(!alwaysOnTop);
    setAlwaysOnTop(applied);
    return applied;
  }, [alwaysOnTop, bridge]);

  const {
    selectedIndex,
    message,
    pendingAction,
    run,
    select,
    copyAt,
    toggleAlwaysOnTop,
  } = useGuiSelection({
    agents: sorted,
    onRefresh: refresh,
    onToggleNotify: toggleNotify,
    onExit: bridge.quit,
    onToggleAlwaysOnTop: applyAlwaysOnTop,
    copy: bridge.writeClipboard,
    stop: bridge.stopAgent,
    kill: bridge.killAgent,
  });

  // ダブルクリックは「選択してコピー」。選択の反映を待たずに済むよう位置を直接渡す
  const handleCopy = useCallback(
    (index: number) => {
      select(index);
      copyAt(index);
    },
    [select, copyAt],
  );

  const pendingAgent = sorted.find((agent) => agent.sessionId === pendingAction?.sessionId);

  return (
    <div className="app">
      <Header
        count={sorted.length}
        lastUpdatedAt={lastUpdatedAt}
        notifyEnabled={notifyEnabled}
        alwaysOnTop={alwaysOnTop}
        isFetching={isFetching}
        onToggleNotify={() => {
          run('toggleNotify');
        }}
        onToggleAlwaysOnTop={toggleAlwaysOnTop}
        onRefresh={() => {
          run('refresh');
        }}
      />

      <main className="app__body">
        {error === null ? (
          <AgentList
            agents={sorted}
            frame={frame}
            selectedIndex={selectedIndex}
            now={now}
            selfSessionId={config.selfSessionId}
            home={config.home}
            onSelect={select}
            onCopy={handleCopy}
          />
        ) : (
          <ErrorView error={error} />
        )}
      </main>

      <Footer message={message} />

      {pendingAction === null || pendingAgent === undefined ? null : (
        <ConfirmDialog
          action={pendingAction.kind}
          name={pendingAgent.name}
          danger={pendingAction.kind === 'kill'}
          onConfirm={() => {
            run('confirm');
          }}
          onCancel={() => {
            run('cancel');
          }}
        />
      )}
    </div>
  );
};
