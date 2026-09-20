# cc-park

マシン上で稼働中の Claude Code セッションを、キャラクターで一覧表示するツールです。
独自ウィンドウで動くデスクトップ GUI（既定）と、ターミナル TUI（`--cli`）の 2 モードがあります。

一定間隔で `claude agents --json` を実行し、各セッションの状態に応じてキャラクターがアニメーションします。
「作業中」「作業完了」「入力待ち」「承認待ち」が一目で判別できます。

GUI の画面は [GUI モード](#gui-モード) を参照してください。以下は `--cli` で起動した場合の表示です。

```
 CC Park 5 sessions                                         notify:on 0:51:04

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
- CLI モードの OS 通知とクリップボードコピーは macOS のみ対応
  （GUI モードは Electron の API を使うため OS を問いません）
- GUI モードは Electron を同梱します（`npm install` 時に約 100〜200MB の追加ダウンロードが発生します）

## インストール

```bash
npm install
npm run build
npm link
```

## 使い方

```bash
cc-park          # GUI（独自ウィンドウ）で起動する
cc-park --cli    # ターミナル（TUI）で起動する
```

### オプション

| オプション | 既定値 | 説明 |
| --- | --- | --- |
| `--cli` | なし | ターミナル（CLI/TUI）で起動する |
| `--gui` | 既定 | 独自ウィンドウ（GUI）で起動する |
| `--interval <ms>` | `2000` | ポーリング間隔（下限 500ms） |
| `--all` | なし | 完了済みバックグラウンドセッションも表示する |
| `--cwd <path>` | なし | 指定パス配下のバックグラウンドセッションのみ表示する |
| `--no-notify` | 通知 ON | OS 通知を無効化する |
| `--finished-highlight <sec>` | `10` | 作業完了ハイライトの保持秒数 |
| `--once` | なし | 1 回だけ取得して描画し終了する（CLI モード） |

```bash
cc-park --all --cwd ~/GitHub
cc-park --cli --interval 1000 --no-notify
```

起動モードは明示したフラグだけで決まります。ランチャーやエディタから起動した場合でも
GUI を開けるよう、標準出力が TTY かどうかは判断材料にしません。
`--once` は CLI 固有の動作なので、単独で指定した場合は CLI モードになります
（`cc-park --once | cat` はこれまでどおりテキストを出力します）。

## CLI モード

`--cli` を付けるとターミナルの TUI で起動します。

```bash
cc-park --cli
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
| `x` | 選択中のセッションのプロセスを kill（`y` で確定 / 他キーで取消） |
| `r` | 即時リフレッシュ |
| `n` | OS 通知の ON / OFF 切り替え |
| `q` / `Ctrl+C` | 終了 |

#### `s`（stop）と `x`（kill）の使い分け

| | `s`（stop） | `x`（kill） |
| --- | --- | --- |
| 対象 | `[bg]` の background セッション | PID を持つ interactive セッション |
| 手段 | `claude stop <id>` | プロセスへ `SIGTERM` を送る |
| 会話 | 残る（`claude attach <id>` で再開） | claude 側の終了処理に委ねられる |

`claude stop` は background セッションにしか使えないため、ターミナルで動いている
interactive セッションを止める手段として `x` を用意しています。対象外のセッションで
押した場合は、確認待ちに入らずもう一方を案内します。

#### `s`（stop）について

- 対象は `[bg]` の background セッションのみ。`claude stop <id>` を実行する
- interactive セッションは `claude stop` が非対応のため弾かれる
- 会話は消えず、`claude attach <id>` で開き直せる
- 誤操作を防ぐため 2 段階確認（`s` → `y`）。確認待ち中の `y` 以外のキーはすべて取消として扱う
- stop 後は state が `stopped` になり、`--all` を付けていない既定の一覧からは消える

#### `x`（kill）について

- 対象は PID を持つセッション（= `claude` が interactive として報告するもの）
- いきなり強制終了せず `SIGTERM` を送る。claude 側に後片付けの余地を残すため
- 誤操作を防ぐため 2 段階確認（`x` → `y`）。確認待ち中の `y` 以外のキーはすべて取消として扱う
- プロセスが既に終了していた場合や権限が無い場合は、理由を添えて失敗を表示する
- `[self]` が付いたセッション（cc-park を起動した自分自身のセッション）も対象になるため、
  確認ダイアログの名前をよく確かめてから実行すること

## GUI モード

引数なしの `cc-park` は独自ウィンドウで起動します（`--gui` を明示しても同じです）。

```bash
cc-park
cc-park --gui --interval 1000 --all
```

![GUI モードのスクリーンショット](docs/gui.png)

表示内容・状態遷移・通知・stop・コピーは CLI モードと同じで、取得や停止のロジックも同じコードを共有しています。
GUI では加えて次の操作ができます。

| 操作 | CLI | GUI |
| --- | --- | --- |
| 選択移動 | `↑` `↓` `k` `j` | 同左 ＋ 行クリック |
| resume コマンドをコピー | `Enter` `c` | 同左 ＋ 行ダブルクリック |
| stop（2 段階確認） | `s` → `y` | 同左 ＋ 確認ダイアログのボタン |
| kill（2 段階確認） | `x` → `y` | 同左 ＋ 確認ダイアログのボタン |
| 確認の取消 | 確認待ち中の `y` 以外のキー | 同左 ＋ `Esc` ＋ 取消ボタン |
| 即時更新 | `r` | 同左 ＋ 更新ボタン |
| 通知 ON / OFF | `n` | 同左 ＋ ヘッダのトグル |
| **最前面に固定** | なし | `t` ＋ ヘッダの `top` トグル（既定 ON） |
| 終了 | `q` `Ctrl+C` | `q` `Cmd+W` `Cmd+Q` |

- ウィンドウは初期 480x640・最小 360x400 でリサイズできます。件数が増えたら一覧側がスクロールします
- OS の外観設定に追従してライト / ダークが切り替わります
- 通知とクリップボードは Electron の API を使うため、`osascript` / `pbcopy` を必要としません

### 最前面に固定する

エディタやターミナルで作業しながらセッションの状態を見張る使い方を想定しているため、
**起動時から最前面に固定された状態** で開きます。

`t` キー、またはヘッダの `top:ON` / `top:off` トグルで固定を解除・再設定できます。

- 切り替えた状態は保存されません。次回もまた固定された状態から始まります
- 実際に固定できたかは OS 側の都合にも左右されるため、表示は main プロセスが適用した結果に追従します

### 制約

- `--gui` と `--once`、`--cli` と `--gui` は併用できません
- 動作確認は macOS のみです（実装上の OS 依存は無く、他 OS でも動作する想定です）
- `.app` / `.dmg` としての配布パッケージはまだ用意していません
- 環境変数 `ELECTRON_RUN_AS_NODE` が設定されていると Electron が素の Node として起動してしまうため、
  `cc-park --gui` は子プロセスの環境からこの変数を取り除いてから Electron を起動します

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

以下の遷移を検出したときに OS 通知を出します。起動直後の通知洪水を防ぐため、初回取得時は通知しません。
CLI モードは `osascript`（macOS のみ）、GUI モードは Electron の Notification を使います。

| 遷移 | 通知内容 |
| --- | --- |
| `BUSY` → `IDLE` | 作業完了・入力待ちになった |
| `*` → `BLOCKED` | 承認を待っている |
| `*` → `DONE` | バックグラウンドが完了した |

## 開発

```bash
npm run dev         # tsc --watch（CLI）
npm run build       # TUI + GUI（preload / renderer）をまとめてビルド
npm run gui:dev     # ビルドして GUI ウィンドウを起動する
npm run typecheck   # 本体・テスト・GUI renderer の型チェック
npm test            # テスト実行
npx vitest run --coverage
```

vite の dev サーバを使う場合は、`CC_PARK_DEV_SERVER` に URL を設定して `npm run gui` を実行すると、
ビルド済み HTML の代わりにその URL を読み込みます。

### 設計メモ

- `claude agents --json` の出力仕様は非公開のため、状態の正規化は `src/core/normalizeAgent.ts` 1 箇所に閉じ、
  未知の状態値は `unknown` にフォールバックして生の値をそのまま画面へ出します。
- `interactive` は `status`、`background` は `state` とキー名が異なるため、`kind` で分岐せず両方を見ます。
- アニメーション（200ms）とポーリング（既定 2000ms）は独立させ、外部コマンドの実行頻度を上げずに滑らかに動かします。
- 前回の取得が終わるまで次の取得を開始しない多重実行ガードを入れています。
- 「作業完了」は生データに無い状態のため、前回スナップショットとの差分から導出しています。
- stop と kill は「確認 → 実行 → 結果表示」の流れが同じなので、`useSelectionCore` では
  操作の種別（`PendingAction`）だけを差し替える 1 つの状態機械にまとめています。
- CLI（TUI）と GUI は「取得・正規化・差分検出・並べ替え・選択状態の遷移」を共有しています。
  UI 非依存の資産は `src/shared/`、入力源に依存しない選択ロジックは `src/hooks/useSelectionCore.ts` に置き、
  ink 依存（`src/components/`）と DOM 依存（`src/gui/renderer/`）は描画と入力の配線だけを受け持ちます。
- GUI の renderer は Node API を使えないため、`node:*` に依存する処理（コマンド実行・通知・クリップボード）は
  すべて Electron の main プロセスへ IPC で委譲しています。renderer 用の `tsconfig.gui.json` は
  `types` から node を外し、`node:*` の混入を型検査で検出できるようにしています。

## ライセンス

MIT
