#!/usr/bin/env node
import { render } from 'ink';
import meow from 'meow';
import { App } from './App.js';
import { MIN_INTERVAL_MS } from './hooks/useAgents.js';
import { DEFAULT_HIGHLIGHT_MS } from './hooks/useTransitions.js';

const cli = meow(
  `
  使い方
    $ claude-code-watcher [options]

  オプション
    --interval <ms>              ポーリング間隔 (既定: 2000, 下限: ${MIN_INTERVAL_MS})
    --all                        完了済みバックグラウンドセッションも表示する
    --cwd <path>                 指定パス配下のバックグラウンドセッションのみ表示する
    --no-notify                  OS 通知を無効化する
    --finished-highlight <sec>   作業完了ハイライトの保持秒数 (既定: ${DEFAULT_HIGHLIGHT_MS / 1000})
    --once                       1 回だけ取得して描画し終了する

  例
    $ claude-code-watcher
    $ claude-code-watcher --interval 1000 --no-notify
    $ claude-code-watcher --all --cwd ~/GitHub
`,
  {
    importMeta: import.meta,
    flags: {
      interval: { type: 'number', default: 2000 },
      all: { type: 'boolean', default: false },
      cwd: { type: 'string' },
      notify: { type: 'boolean', default: true },
      finishedHighlight: { type: 'number', default: DEFAULT_HIGHLIGHT_MS / 1000 },
      once: { type: 'boolean', default: false },
    },
  },
);

// 非 TTY（パイプ・リダイレクト）ではキー入力を扱えないため 1 回描画に切り替える
const interactive = !cli.flags.once && process.stdout.isTTY === true;

const { waitUntilExit } = render(
  <App
    intervalMs={Math.max(cli.flags.interval, MIN_INTERVAL_MS)}
    all={cli.flags.all}
    cwd={cli.flags.cwd}
    notify={cli.flags.notify}
    highlightMs={Math.max(cli.flags.finishedHighlight, 0) * 1000}
    interactive={interactive}
    selfSessionId={process.env['CLAUDE_CODE_SESSION_ID'] ?? null}
    platform={process.platform}
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
