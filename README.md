# cc-park

マシン上で稼働中の Claude Code セッションを、キャラクターで一覧表示するターミナル TUI です。

一定間隔で `claude agents --json` を実行し、各セッションの状態に応じてキャラクターがアニメーションします。
「作業中」「作業完了」「入力待ち」「承認待ち」が一目で判別できます。

```
 cc-park 5 sessions                                         notify:on 0:51:04

 > (\_/)    claude agents setup [bg] ~
   ( oAo)!  BLOCKED  needs your approval 10h39m

   (\_/)    cc-park-bd [self] ~/GitHub/cc-park
   ( -v-)/  BUSY     working... 21m

   (\_/)    vscode-ai-coding-sidebar-3e ~/GitHub/vscode-ai-coding-sidebar
   ( -v-)z  IDLE     waiting for input 37m
```

## 必要環境

- Node.js 20 以上
- `claude` コマンド（Claude Code CLI）が PATH に通っていること
- OS 通知とクリップボードコピーは macOS のみ対応

## インストール

```bash
npm install
npm run build
npm link
```

## 使い方

```bash
cc-park
```

### オプション

| オプション | 既定値 | 説明 |
| --- | --- | --- |
| `--interval <ms>` | `2000` | ポーリング間隔（下限 500ms） |
| `--all` | なし | 完了済みバックグラウンドセッションも表示する |
| `--cwd <path>` | なし | 指定パス配下のバックグラウンドセッションのみ表示する |
| `--no-notify` | 通知 ON | OS 通知を無効化する |
| `--finished-highlight <sec>` | `10` | 作業完了ハイライトの保持秒数 |
| `--once` | なし | 1 回だけ取得して描画し終了する |

```bash
cc-park --interval 1000 --no-notify
cc-park --all --cwd ~/GitHub
```

パイプやリダイレクトなど非 TTY 環境では、自動的に `--once` 相当の動作になります。

### 画面の扱い

対話起動時は **代替スクリーン**（vim や htop と同じ仕組み）で描画します。
再描画のたびに端末のスクロールバックへ出力が流れることがなく、`q` で終了すると元の画面が復元されます。

セッション数が端末の高さに収まらない場合は、選択行を中心に収まる分だけ表示し、
隠れている件数を `^ 他 N 件` / `v 他 N 件` として上下に示します。カーソル移動に追従してスクロールします。

### キーバインド

| キー | 動作 |
| --- | --- |
| `↑` / `k` | カーソルを上へ |
| `↓` / `j` | カーソルを下へ |
| `Enter` / `c` | `claude --resume <sessionId>` をクリップボードへコピー |
| `s` | 選択中の background セッションを stop（`y` で確定 / 他キーで取消） |
| `r` | 即時リフレッシュ |
| `n` | OS 通知の ON / OFF 切り替え |
| `q` / `Ctrl+C` | 終了 |

#### `s`（stop）について

- 対象は `[bg]` の background セッションのみ。`claude stop <id>` を実行する
- interactive セッションは `claude stop` が非対応のため弾かれる
- 会話は消えず、`claude attach <id>` で開き直せる
- 誤操作を防ぐため 2 段階確認（`s` → `y`）。確認待ち中の `y` 以外のキーはすべて取消として扱う
- stop 後は state が `stopped` になり、`--all` を付けていない既定の一覧からは消える

## 状態とキャラクター

| 表示 | キャラクター | 意味 |
| --- | --- | --- |
| `BLOCKED` | `( oAo)!` | 承認・入力を待っている（要対応） |
| `DONE!` | `\(\_/)/` `( ^v^)*` | 作業が完了した直後（既定 10 秒間） |
| `BUSY` | `( -v-)/` `( ovo)_` | 作業中 |
| `IDLE` | `( -v-)zZ` | 入力待ち |
| `DONE` | `( ^v^)+` | バックグラウンドが完了（`--all`） |
| `STOPPED` | `( xvx)` | 停止済み（`--all`） |
| `UNKNOWN` | `( ?v?)?` | 未知の状態（生の状態文字列を併記） |

一覧は要対応のものが上に来るよう並べ替えられます。

## OS 通知

以下の遷移を検出したときに macOS 通知を出します。起動直後の通知洪水を防ぐため、初回取得時は通知しません。

| 遷移 | 通知内容 |
| --- | --- |
| `BUSY` → `IDLE` | 作業完了・入力待ちになった |
| `*` → `BLOCKED` | 承認を待っている |
| `*` → `DONE` | バックグラウンドが完了した |

## 開発

```bash
npm run dev         # tsc --watch
npm run typecheck   # 本体とテストの型チェック
npm test            # テスト実行
npx vitest run --coverage
```

### 設計メモ

- `claude agents --json` の出力仕様は非公開のため、状態の正規化は `src/core/normalizeAgent.ts` 1 箇所に閉じ、
  未知の状態値は `unknown` にフォールバックして生の値をそのまま画面へ出します。
- `interactive` は `status`、`background` は `state` とキー名が異なるため、`kind` で分岐せず両方を見ます。
- アニメーション（200ms）とポーリング（既定 2000ms）は独立させ、外部コマンドの実行頻度を上げずに滑らかに動かします。
- 前回の取得が終わるまで次の取得を開始しない多重実行ガードを入れています。
- 「作業完了」は生データに無い状態のため、前回スナップショットとの差分から導出しています。

## ライセンス

MIT
