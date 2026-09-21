import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, ipcMain, Notification } from 'electron';
import { fetchAgents } from '../core/fetchAgents.js';
import { killAgent } from '../core/killAgent.js';
import { resolveShellPath } from '../core/shellPath.js';
import { stopAgent } from '../core/stopAgent.js';
import type { NotificationPayload } from '../shared/notification.js';
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

/** ウィンドウの既定サイズ。縦長の一覧なのでスマートフォン寄りの比率にする。 */
const WINDOW_WIDTH = 480;
const WINDOW_HEIGHT = 640;
const MIN_WINDOW_WIDTH = 360;
const MIN_WINDOW_HEIGHT = 400;

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
    meta: config.prompt || config.tokens,
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

ipcMain.on(IPC_CHANNELS.notify, (_event, payload: NotificationPayload) => {
  if (!Notification.isSupported()) {
    return;
  }
  new Notification({ title: payload.title, body: payload.message }).show();
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

/*
 * ここで top-level await を使うとモジュール評価が終わらず、Electron の ready
 * イベントが発火しないまま停止する（ESM エントリ固有の制約）。必ず then で受ける。
 */
app
  .whenReady()
  .then(preparePath)
  .then(createWindow)
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
  app.quit();
});
