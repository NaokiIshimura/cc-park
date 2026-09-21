#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { render } from 'ink';
import meow from 'meow';
import { App } from './App.js';
import {
  buildGuiArgs,
  buildGuiEnv,
  ELECTRON_MISSING_MESSAGE,
  resolveElectronPath,
  resolveGuiFlags,
  resolveStartupMode,
} from './gui/launch.js';
import { MIN_INTERVAL_MS } from './hooks/useAgents.js';
import { DEFAULT_HIGHLIGHT_MS } from './hooks/useTransitions.js';

const cli = meow(
  `
  使い方
    $ cc-park [options]

    既定では独自ウィンドウ (GUI) で起動します。ターミナルで動かすには --cli を付けます。

  オプション
    --cli                        ターミナル (CLI/TUI) で起動する
    --gui                        独自ウィンドウ (GUI) で起動する (既定)
    --interval <ms>              ポーリング間隔 (既定: 2000, 下限: ${MIN_INTERVAL_MS})
    --all                        完了済みバックグラウンドセッションも表示する
    --cwd <path>                 指定パス配下のバックグラウンドセッションのみ表示する
    --no-notify                  OS 通知を無効化する
    --prompt                     最後に与えたプロンプトを表示する (GUI は既定で ON)
    --tokens                     コンテキスト利用率を表示する (GUI は既定で ON)
    --context-limit <tokens>     コンテキスト上限を明示指定する (既定: 使用量から推定)
    --finished-highlight <sec>   作業完了ハイライトの保持秒数 (既定: ${DEFAULT_HIGHLIGHT_MS / 1000})
    --once                       1 回だけ取得して描画し終了する (CLI モード)

  例
    $ cc-park
    $ cc-park --cli
    $ cc-park --cli --interval 1000 --no-notify
    $ cc-park --all --cwd ~/GitHub
    $ cc-park --cli --prompt --tokens
    $ cc-park --no-prompt --no-tokens
`,
  {
    importMeta: import.meta,
    flags: {
      interval: { type: 'number', default: 2000 },
      all: { type: 'boolean', default: false },
      cwd: { type: 'string' },
      notify: { type: 'boolean', default: true },
      prompt: { type: 'boolean', default: false },
      tokens: { type: 'boolean', default: false },
      contextLimit: { type: 'number', default: 0 },
      finishedHighlight: { type: 'number', default: DEFAULT_HIGHLIGHT_MS / 1000 },
      once: { type: 'boolean', default: false },
      cli: { type: 'boolean', default: false },
      gui: { type: 'boolean', default: false },
    },
  },
);

const intervalMs = Math.max(cli.flags.interval, MIN_INTERVAL_MS);
const highlightMs = Math.max(cli.flags.finishedHighlight, 0) * 1000;
const selfSessionId = process.env['CLAUDE_CODE_SESSION_ID'] ?? null;
// 0 は「指定なし（使用量から推定）」を表す
const contextLimit = Math.max(cli.flags.contextLimit, 0);

/** GUI モード: Ink を描画せず、Electron を子プロセスとして起動する。 */
const startGui = async (): Promise<void> => {
  // 明示されなかった表示オプションは GUI 用の既定へ倒す
  const display = resolveGuiFlags(
    { all: cli.flags.all, prompt: cli.flags.prompt, tokens: cli.flags.tokens },
    process.argv.slice(2),
  );

  const electronPath = await resolveElectronPath(() => import('electron'));
  if (electronPath === null) {
    console.error(ELECTRON_MISSING_MESSAGE);
    process.exit(1);
  }

  const mainPath = fileURLToPath(new URL('./gui/main.js', import.meta.url));
  const child = spawn(
    electronPath,
    buildGuiArgs(mainPath, {
      intervalMs,
      cwd: cli.flags.cwd,
      notify: cli.flags.notify,
      highlightMs,
      selfSessionId,
      contextLimit,
      ...display,
    }),
    { stdio: 'inherit', env: buildGuiEnv(process.env) },
  );

  // 子プロセスの終了コードをそのまま引き継ぎ、プロセスを残さない
  child.on('exit', (code, signal) => {
    process.exit(signal === null ? (code ?? 0) : 1);
  });
};

/** CLI モード: Ink で端末に描画する。 */
const startCli = async (): Promise<void> => {
  // 非 TTY（パイプ・リダイレクト）ではキー入力を扱えないため 1 回描画に切り替える
  const interactive = !cli.flags.once && process.stdout.isTTY === true;

  const { waitUntilExit } = render(
    <App
      intervalMs={intervalMs}
      all={cli.flags.all}
      cwd={cli.flags.cwd}
      notify={cli.flags.notify}
      highlightMs={highlightMs}
      interactive={interactive}
      selfSessionId={selfSessionId}
      platform={process.platform}
      prompt={cli.flags.prompt}
      tokens={cli.flags.tokens}
      contextLimit={contextLimit}
    />,
    {
      patchConsole: false,
      // 再描画のたびにスクロールバックへ流れないよう、対話時は代替スクリーンを使う
      // （vim や htop と同じ方式。非対話時は Ink 側で無視される）
      alternateScreen: interactive,
    },
  );

  if (!interactive) {
    // 初回取得が終わるのを待ってから終了する
    setTimeout(() => {
      process.exit(0);
    }, 3000);
  }

  await waitUntilExit();
};

const startup = resolveStartupMode({
  cli: cli.flags.cli,
  gui: cli.flags.gui,
  once: cli.flags.once,
});

if (!startup.ok) {
  console.error(startup.message);
  process.exit(1);
}

await (startup.mode === 'gui' ? startGui() : startCli());
