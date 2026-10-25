import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAgents } from '../../hooks/useAgents.js';
import { useAnimationTick } from '../../hooks/useAnimationTick.js';
import { useNotifications } from '../../hooks/useNotifications.js';
import { useTransitions } from '../../hooks/useTransitions.js';
import {
  nextCompactLayout,
  type CompactMode,
  type CompactSettings,
} from '../../shared/compactSettings.js';
import { flattenGroups, groupAgents } from '../../shared/groupAgents.js';
import { shouldCompact } from '../compact.js';
import { nextOpacity, type GuiConfig } from '../config.js';
import type { CcParkBridge } from '../ipc.js';
import { createBridgeFetcher } from './bridge.js';
import { AgentList } from './components/AgentList/index.js';
import { ErrorView } from './components/ErrorView/index.js';
import { Footer } from './components/Footer/index.js';
import { Header } from './components/Header/index.js';
import { MiniView } from './components/MiniView/index.js';
import { ConfirmDialog } from './components/ConfirmDialog/index.js';
import { SchedulePanel } from './components/SchedulePanel/index.js';
import { SettingsPanel } from './components/SettingsPanel/index.js';
import { systemPrefersDark } from './appearance.js';
import { useAppearance } from './hooks/useAppearance.js';
import { useCompact } from './hooks/useCompact.js';
import { useGuiSelection } from './hooks/useGuiSelection.js';
import { useSchedules } from './hooks/useSchedules.js';

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
  const [opacity, setOpacity] = useState(config.opacity);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 前回の終了時の状態から再開する
  const [compactSettings, setCompactSettings] = useState<CompactSettings>(config.compact);

  const { appearance, change: changeAppearance } = useAppearance(bridge, config.appearance);

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

  // 描画は cwd ごとのグループ、選択はフラットな添字。順序を必ず一致させる
  const groups = useMemo(() => groupAgents(decorated), [decorated]);
  const sorted = useMemo(() => flattenGroups(groups), [groups]);

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

  const applyOpacity = useCallback(async () => {
    const applied = await bridge.setOpacity(nextOpacity(opacity));
    setOpacity(applied);
    return applied;
  }, [opacity, bridge]);

  const schedules = useSchedules(bridge);

  const toggleSchedules = useCallback(() => {
    setScheduleOpen((open) => !open);
  }, []);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => !open);
  }, []);

  // 自分で切り替えたときだけ保存する。予約画面などで一時的に広げたときは保存しない
  const changeCompactSettings = useCallback(
    (next: CompactSettings) => {
      setCompactSettings(next);
      void bridge.saveCompactSettings(next);
    },
    [bridge],
  );

  // 切り替え後の状態を返し、フッタのメッセージに使わせる
  const toggleCompactMode = useCallback(() => {
    const next: CompactMode = compactSettings.mode === 'on' ? 'off' : 'on';
    changeCompactSettings({ ...compactSettings, mode: next });
    return next;
  }, [compactSettings, changeCompactSettings]);

  const toggleCompactLayout = useCallback(() => {
    changeCompactSettings({
      ...compactSettings,
      layout: nextCompactLayout(compactSettings.layout),
    });
  }, [compactSettings, changeCompactSettings]);

  const {
    selectedIndex,
    message,
    pendingAction,
    run,
    select,
    copyAt,
    setMessage,
    toggleAlwaysOnTop,
    cycleOpacity,
    toggleCompact,
  } = useGuiSelection({
    agents: sorted,
    onRefresh: refresh,
    onToggleNotify: toggleNotify,
    onExit: bridge.quit,
    onToggleAlwaysOnTop: applyAlwaysOnTop,
    onCycleOpacity: applyOpacity,
    onToggleCompact: toggleCompactMode,
    onToggleSchedules: toggleSchedules,
    copy: bridge.writeClipboard,
    stop: bridge.stopAgent,
    kill: bridge.killAgent,
    // 予約・設定の画面を開いている間は、一覧のキー操作を止める
    enabled: !scheduleOpen && !settingsOpen,
  });

  // 予約の発火はフッタにも出す。通知を切っていても画面で気づけるようにする
  const { firedEvent } = schedules;
  useEffect(() => {
    if (firedEvent !== null) {
      setMessage(firedEvent.message);
    }
  }, [firedEvent, setMessage]);

  // ダブルクリックは「選択してコピー」。選択の反映を待たずに済むよう位置を直接渡す
  const handleCopy = useCallback(
    (index: number) => {
      select(index);
      copyAt(index);
    },
    [select, copyAt],
  );

  const pendingAgent = sorted.find((agent) => agent.sessionId === pendingAction?.sessionId);

  /*
   * 取得エラー・予約 / 設定画面・確認ダイアログはミニ表示に出せないため、出ている間だけ広げて見せる。
   * ミニ表示では選択中の行が見えないので、キー操作で開いたときも見えないまま進めさせない。
   */
  const compact = shouldCompact(
    compactSettings.mode,
    error !== null || scheduleOpen || settingsOpen || pendingAction !== null,
  );
  const { reportSize } = useCompact({ bridge, compact });

  const appClassName = ['app', alwaysOnTop ? 'app--pinned' : '', compact ? 'app--mini' : '']
    .filter((name) => name !== '')
    .join(' ');

  if (compact) {
    return (
      <div className={appClassName}>
        <MiniView
          groups={groups}
          frame={frame}
          home={config.home}
          layout={compactSettings.layout}
          onToggleLayout={toggleCompactLayout}
          onExpand={toggleCompact}
          onResize={reportSize}
        />
      </div>
    );
  }

  return (
    <div className={appClassName}>
      <Header
        count={sorted.length}
        lastUpdatedAt={lastUpdatedAt}
        notifyEnabled={notifyEnabled}
        alwaysOnTop={alwaysOnTop}
        opacity={opacity}
        compactMode={compactSettings.mode}
        isFetching={isFetching}
        onToggleNotify={() => {
          run('toggleNotify');
        }}
        onToggleAlwaysOnTop={toggleAlwaysOnTop}
        onCycleOpacity={cycleOpacity}
        onToggleCompact={toggleCompact}
        onRefresh={() => {
          run('refresh');
        }}
        onOpenSchedules={toggleSchedules}
        onOpenSettings={toggleSettings}
      />

      <main className="app__body">
        {error === null ? (
          <AgentList
            groups={groups}
            frame={frame}
            selectedIndex={selectedIndex}
            now={now}
            selfSessionId={config.selfSessionId}
            scheduledLaunches={schedules.launches}
            home={config.home}
            showPrompt={config.prompt}
            showTokens={config.tokens}
            showSubagents={config.subagents}
            onSelect={select}
            onCopy={handleCopy}
          />
        ) : (
          <ErrorView error={error} />
        )}
      </main>

      <Footer message={message} />

      {!scheduleOpen ? null : (
        <SchedulePanel
          schedules={schedules.schedules}
          now={now}
          home={config.home}
          onPickDirectory={(defaultPath) => bridge.pickDirectory(defaultPath)}
          onSave={(schedule) => {
            void schedules.save(schedule);
          }}
          onDelete={(id) => {
            void schedules.remove(id);
          }}
          onToggle={(schedule) => {
            void schedules.setEnabled(schedule.id, !schedule.enabled);
          }}
          onClose={toggleSchedules}
        />
      )}

      {!settingsOpen ? null : (
        <SettingsPanel
          appearance={appearance}
          prefersDark={systemPrefersDark()}
          onChange={(next) => {
            void changeAppearance(next);
          }}
          onClose={toggleSettings}
        />
      )}

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
