#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import meow from 'meow';
import { GUI_DEFAULT_FLAGS } from './gui/config.js';
import {
  buildGuiArgs,
  buildGuiEnv,
  ELECTRON_MISSING_MESSAGE,
  findRemovedFlag,
  isFlagGiven,
  REMOVED_CLI_MESSAGE,
  resolveAppearanceFlags,
  resolveElectronPath,
} from './gui/launch.js';
import { MIN_INTERVAL_MS } from './hooks/useAgents.js';
import { DEFAULT_HIGHLIGHT_MS } from './hooks/useTransitions.js';
import { THEME_IDS } from './shared/themes.js';

const cli = meow(
  `
  使い方
    $ cc-park [options]

    独自ウィンドウ (GUI) を起動します。

  オプション
    --interval <ms>              ポーリング間隔 (既定: 2000, 下限: ${MIN_INTERVAL_MS})
    --all                        完了済みバックグラウンドセッションも表示する
    --cwd <path>                 指定パス配下のバックグラウンドセッションのみ表示する
    --no-notify                  OS 通知を無効化する
    --no-prompt                  最後に与えたプロンプトを表示しない
    --no-tokens                  コンテキスト利用率を表示しない
    --no-subagents               実行中のサブエージェントを表示しない
    --context-limit <tokens>     コンテキスト上限を明示指定する (既定: 使用量から推定)
    --finished-highlight <sec>   作業完了ハイライトの保持秒数 (既定: ${DEFAULT_HIGHLIGHT_MS / 1000})
    --theme <name>               配色テーマ (${THEME_IDS.join(' / ')})
    --accent <#rrggbb>           強調色 (枠線・選択行など)
    --frame                      ウィンドウ外周に枠線を描く (既定: OFF)
    --debug                      受け取った claude agents --json の出力と、解釈できない値を
                                 ~/.cc-park/debug/ に記録する

  例
    $ cc-park
    $ cc-park --interval 1000 --no-notify
    $ cc-park --all --cwd ~/GitHub
    $ cc-park --no-prompt --no-tokens --no-subagents
    $ cc-park --theme navy --accent '#f59e0b'
`,
  {
    importMeta: import.meta,
    flags: {
      interval: { type: 'number', default: 2000 },
      all: { type: 'boolean', default: GUI_DEFAULT_FLAGS.all },
      cwd: { type: 'string' },
      notify: { type: 'boolean', default: true },
      prompt: { type: 'boolean', default: GUI_DEFAULT_FLAGS.prompt },
      tokens: { type: 'boolean', default: GUI_DEFAULT_FLAGS.tokens },
      subagents: { type: 'boolean', default: GUI_DEFAULT_FLAGS.subagents },
      contextLimit: { type: 'number', default: 0 },
      finishedHighlight: { type: 'number', default: DEFAULT_HIGHLIGHT_MS / 1000 },
      theme: { type: 'string' },
      accent: { type: 'string' },
      frame: { type: 'boolean', default: false },
      debug: { type: 'boolean', default: false },
    },
  },
);

const argv = process.argv.slice(2);

if (findRemovedFlag(argv) !== null) {
  console.error(REMOVED_CLI_MESSAGE);
  process.exit(1);
}

const appearance = resolveAppearanceFlags({
  theme: cli.flags.theme,
  accent: cli.flags.accent,
  // 指定しなかった場合は保存済みの設定に従わせるため、明示したときだけ渡す
  frame: isFlagGiven(argv, 'frame') ? cli.flags.frame : undefined,
});
if (!appearance.ok) {
  console.error(appearance.message);
  process.exit(1);
}

const electronPath = await resolveElectronPath(() => import('electron'));
if (electronPath === null) {
  console.error(ELECTRON_MISSING_MESSAGE);
  process.exit(1);
}

const mainPath = fileURLToPath(new URL('./gui/main.js', import.meta.url));
const child = spawn(
  electronPath,
  buildGuiArgs(mainPath, {
    intervalMs: Math.max(cli.flags.interval, MIN_INTERVAL_MS),
    cwd: cli.flags.cwd,
    notify: cli.flags.notify,
    highlightMs: Math.max(cli.flags.finishedHighlight, 0) * 1000,
    selfSessionId: process.env['CLAUDE_CODE_SESSION_ID'] ?? null,
    // 0 は「指定なし（使用量から推定）」を表す
    contextLimit: Math.max(cli.flags.contextLimit, 0),
    theme: appearance.theme,
    accent: appearance.accent,
    frame: appearance.frame,
    debug: cli.flags.debug,
    all: cli.flags.all,
    prompt: cli.flags.prompt,
    tokens: cli.flags.tokens,
    subagents: cli.flags.subagents,
  }),
  { stdio: 'inherit', env: buildGuiEnv(process.env) },
);

// 子プロセスの終了コードをそのまま引き継ぎ、プロセスを残さない
child.on('exit', (code, signal) => {
  process.exit(signal === null ? (code ?? 0) : 1);
});
