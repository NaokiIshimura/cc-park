import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Notification,
  powerMonitor,
  type OpenDialogOptions,
} from 'electron';
import { fetchAgents } from '../core/fetchAgents.js';
import { killAgent } from '../core/killAgent.js';
import { launchAgent } from '../core/launchAgent.js';
import {
  loadScheduledLaunches,
  loadSchedules,
  saveScheduledLaunches,
  saveSchedules,
} from '../core/scheduleStore.js';
import { createScheduler, type ScheduleFiredEvent } from '../core/scheduler.js';
import { resolveShellPath } from '../core/shellPath.js';
import { stopAgent } from '../core/stopAgent.js';
import type { NotificationPayload } from '../shared/notification.js';
import type { Schedule } from '../shared/schedule.js';
import type { Agent } from '../types/agent.js';
import { DEFAULT_ALWAYS_ON_TOP, parseGuiOptions, type GuiConfig } from './config.js';
import { IPC_CHANNELS, type FetchAgentsRequest } from './ipc.js';

/**
 * Electron の main プロセス。
 *
 * 判断を伴う処理は持たず、ウィンドウ生成と「既存 core への取り次ぎ」だけを行う
 * （ロジックは共有モジュール側でテストする）。
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * アプリ名。`electron dist/gui/main.js` のようにファイルを直接指定して起動すると
 * 既定値の "Electron" になり、userData の保存先などがその名前になってしまうため明示する。
 * app.whenReady() より前に設定する必要がある。
 *
 * なお macOS のメニューバーに出る名前はバンドルの Info.plist（CFBundleName）が優先されるため、
 * これでは変わらない。`npm run gui:package` で .app にすると cc-park と表示される。
 */
app.setName('cc-park');

/**
 * Dock のアイコン。
 *
 * .app にした場合はバンドルの Info.plist（CFBundleIconFile）が使われるため何もしなくてよいが、
 * `npm run gui` のようにファイルを直接指定して起動すると Electron 既定のアイコンになる。
 * 開発中も見た目を揃えるため、リポジトリ内の PNG を読ませる。
 */
const applyDevDockIcon = (): void => {
  if (app.isPackaged || app.dock === undefined) {
    return;
  }
  app.dock.setIcon(join(HERE, '..', '..', 'assets', 'icon.png'));
};

/**
 * ウィンドウのサイズ。縦長の一覧なのでスマートフォン寄りの比率にする。
 * 既定幅は最小幅に合わせ、置き場所を取らない一番狭い状態で開く。
 */
const MIN_WINDOW_WIDTH = 360;
const MIN_WINDOW_HEIGHT = 400;
const WINDOW_WIDTH = MIN_WINDOW_WIDTH;
const WINDOW_HEIGHT = 640;

const config: GuiConfig = {
  ...parseGuiOptions(process.argv),
  home: homedir(),
  platform: process.platform,
  alwaysOnTop: DEFAULT_ALWAYS_ON_TOP,
};

/** vite の dev サーバ経由で起動する場合の URL。未設定ならビルド済み HTML を読む。 */
const devServerUrl = process.env['CC_PARK_DEV_SERVER'];

const createWindow = async (): Promise<void> => {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: 'CC Park',
    backgroundColor: '#11131a',
    alwaysOnTop: DEFAULT_ALWAYS_ON_TOP,
    // 描画が整うまで待ってから見せ、白い画面のちらつきを防ぐ
    show: false,
    webPreferences: {
      preload: join(HERE, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  if (devServerUrl !== undefined && devServerUrl !== '') {
    await window.loadURL(devServerUrl);
    return;
  }
  await window.loadFile(join(HERE, 'renderer', 'index.html'));
};

/** OS 通知を出す。renderer からの依頼と、予約の発火の双方から使う。 */
const showNotification = (payload: NotificationPayload): void => {
  if (!Notification.isSupported()) {
    return;
  }
  new Notification({ title: payload.title, body: payload.message }).show();
};

/** 開いているすべてのウィンドウへ送る。 */
const broadcast = (channel: string, payload: unknown): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
};

/**
 * 予約の発火ループ。
 *
 * 一覧の保持も含めてすべて `createScheduler` に任せ、ここは取り次ぎだけにする
 * （main はテスト対象外なので、判断を伴う処理を置かない）。
 */
const scheduler = createScheduler({
  load: () => loadSchedules({ home: config.home }),
  save: (schedules) => saveSchedules(schedules, { home: config.home }),
  launch: (schedule) => launchAgent(schedule),
  loadLaunches: () => loadScheduledLaunches({ home: config.home }),
  saveLaunches: (launches) => saveScheduledLaunches(launches, { home: config.home }),
  // 予約の通知は起動時の設定に従う（--no-notify ですべて黙らせられるようにする）
  notify: config.notify ? showNotification : undefined,
  onFired: (event: ScheduleFiredEvent) => {
    broadcast(IPC_CHANNELS.scheduleFired, event);
  },
});

ipcMain.handle(IPC_CHANNELS.listSchedules, () => scheduler.list());

ipcMain.handle(IPC_CHANNELS.saveSchedule, (_event, schedule: Schedule) =>
  scheduler.save(schedule),
);

ipcMain.handle(IPC_CHANNELS.deleteSchedule, (_event, id: string) => scheduler.remove(id));

ipcMain.handle(IPC_CHANNELS.setScheduleEnabled, (_event, id: string, enabled: boolean) =>
  scheduler.setEnabled(id, enabled),
);

ipcMain.handle(IPC_CHANNELS.listScheduledLaunches, () => scheduler.listLaunches());

ipcMain.handle(IPC_CHANNELS.getConfig, (event): GuiConfig => {
  // 最前面固定は OS 側の都合で適用されないことがあるため、実際の状態を返す
  const window = BrowserWindow.fromWebContents(event.sender);
  return { ...config, alwaysOnTop: window?.isAlwaysOnTop() ?? DEFAULT_ALWAYS_ON_TOP };
});

ipcMain.handle(IPC_CHANNELS.fetchAgents, async (_event, request: FetchAgentsRequest) =>
  // transcript の読み取りは node 側でしかできないため、ここで合成して renderer へ返す
  fetchAgents({
    all: request.all,
    cwd: request.cwd,
    meta: config.prompt || config.tokens || config.subagents,
    home: config.home,
    contextLimit: config.contextLimit === 0 ? undefined : config.contextLimit,
  }),
);

ipcMain.handle(IPC_CHANNELS.stopAgent, async (_event, agent: Agent) => stopAgent(agent));

ipcMain.handle(IPC_CHANNELS.killAgent, async (_event, agent: Agent) => killAgent(agent));

ipcMain.handle(IPC_CHANNELS.writeClipboard, (_event, text: string) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle(IPC_CHANNELS.setAlwaysOnTop, (event, value: boolean) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window === null) {
    return false;
  }
  window.setAlwaysOnTop(value);
  // 適用できたかは OS 側の都合もあるため、実際の状態を返す
  return window.isAlwaysOnTop();
});

/**
 * ディレクトリ選択ダイアログ。
 *
 * 親ウィンドウを渡してシートにする。渡さないと最前面固定（alwaysOnTop）の本体が
 * 手前に残り、選択ダイアログが背面に隠れて操作できなくなる。
 */
ipcMain.handle(IPC_CHANNELS.pickDirectory, async (event, defaultPath: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    properties: ['openDirectory', 'createDirectory'],
    ...(defaultPath === '' ? {} : { defaultPath }),
  };

  const result =
    window === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(window, options);

  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.on(IPC_CHANNELS.notify, (_event, payload: NotificationPayload) => {
  showNotification(payload);
});

ipcMain.on(IPC_CHANNELS.quit, () => {
  app.quit();
});

/**
 * Finder から起動したときは PATH が `/usr/bin:/bin:/usr/sbin:/sbin` しか無く、
 * `~/.local/bin` などに入る `claude` を見つけられない。
 * 最初の取得が走る前に、ログインシェルと同じ PATH へ揃えておく。
 */
const preparePath = async (): Promise<void> => {
  process.env['PATH'] = await resolveShellPath({ home: config.home });
};

/**
 * 予約の監視を始める。
 *
 * `preparePath` の後でなければならない。PATH が整う前に発火すると
 * `claude` が見つからず、予約がすべて失敗してしまう。
 */
const startScheduler = async (): Promise<void> => {
  await scheduler.start();

  // スリープ中はタイマーが進まないため、復帰したその場で判定し直す
  powerMonitor.on('resume', () => {
    void scheduler.tick();
  });
};

/*
 * ここで top-level await を使うとモジュール評価が終わらず、Electron の ready
 * イベントが発火しないまま停止する（ESM エントリ固有の制約）。必ず then で受ける。
 */
app
  .whenReady()
  .then(applyDevDockIcon)
  .then(preparePath)
  .then(createWindow)
  .then(startScheduler)
  .catch((error: unknown) => {
    console.error('ウィンドウの起動に失敗しました:', error);
    app.quit();
  });

app.on('activate', () => {
  // macOS では Dock から再アクティブ化されたときにウィンドウを作り直す
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

// 常駐させる用途ではないため、ウィンドウを閉じたら macOS でもプロセスを終了する
app.on('window-all-closed', () => {
  scheduler.stop();
  app.quit();
});
