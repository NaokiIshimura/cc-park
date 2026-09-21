# CLAUDE.md

Claude Code がこのリポジトリで作業するときの指針。

## このツールについて

マシン上で稼働中の Claude Code セッションを、キャラクターで一覧表示するツール。
デスクトップ GUI（既定・Electron）とターミナル TUI（`--cli`・Ink）の 2 モードがある。

## コマンド

```bash
npm run build       # TUI + GUI（preload / renderer）をまとめてビルド
npm run typecheck   # 本体・テスト・GUI renderer の 3 構成すべて型チェック
npm test            # 全テスト
npx vitest run <ファイルパス>   # テストは対象を指定して実行する
npm run gui:dev     # ビルドして GUI ウィンドウを起動
npm run gui:package # .app にパッケージ化（アプリ名を cc-park で表示したいときはこちらを起動）
npm run icon:build  # AA からアプリアイコンを生成（assets/icon.svg / .png / .icns）
node dist/cli.js --once --all   # TUI を 1 回だけ描画（実描画の確認用）
```

変更後は **テスト・型チェック・ビルドの 3 つ**を通すこと。

## リリース

`main` へマージすると `.github/workflows/release.yml` が arm64 / x64 の `.app` をビルドし、
`package.json` の `version` に対応するタグ（`v<version>`）が未公開なら Releases へ公開する。
既に公開済みならリリースは作らず、実行ログの artifact にだけ残す。
**配布したいときは `package.json` の `version` を上げてからマージする。**

## キャラクター（AA）を変更するときの決まり

AA の定義は `src/shared/characters.ts` の 1 箇所だけ。TUI と GUI が同じ定義を共有する。

### 重要: アニメーションや AA を変更したら README.md も更新する

`src/shared/characters.ts` のフレーム・色・ラベル・説明文を変更したら、
**必ず `README.md` の以下を同じ内容に更新する**こと。片方だけ直すと食い違う。

| README の箇所 | 内容 |
| --- | --- |
| 冒頭の表示サンプル | `--cli` の画面例。実際の AA と揃える |
| `### ステータス一覧` | 表示・色・動く部位・フレーム数・動き・意味の表 |
| `### ステータスごとのアニメーション` | 各ステータスの状態キー・色・優先度・説明文・動き・AA の全フレーム |
| `### 手（1 行目の両端）` | 手のポーズの図 |
| `### 足（3 行目）` | 足の図 |

README に載せる AA は**手で書かずに `src/shared/characters.ts` から生成する**こと。
例:

```bash
node --experimental-strip-types -e "
import { CHARACTERS, getFrame } from './src/shared/characters.ts';
for (const s of Object.keys(CHARACTERS)) {
  const n = CHARACTERS[s].frames.length;
  console.log(CHARACTERS[s].label, n, 'frames');
  const lines = [[], [], []];
  for (const f of CHARACTERS[s].frames) f.split('\n').forEach((r, i) => lines[i].push(r));
  console.log(lines.map((r) => r.join('   ')).join('\n'));
}
"
```

GUI のスクリーンショット `docs/gui.png` と、README 冒頭のアニメーション `docs/gui.gif` も
見た目が変わったら撮り直す（撮り方は「GIF の撮り直し」）。

アプリアイコン `assets/icon.*` も `src/shared/characters.ts` から生成している
（`justFinished` の両手を上げたフレーム）。AA を変えたら `npm run icon:build` で作り直し、
生成物をコミットする。生成には `rsvg-convert`（`brew install librsvg`）が要る。

### AA の制約

| 制約 | 内容 |
| --- | --- |
| サイズ | 全フレーム **3 行 x 9 桁**。崩すとレイアウトが揺れる |
| 使える文字 | Block Elements（U+2580–U+259F）と空白だけ |
| フォント | `Menlo` と `SF Mono` の**両方**に収録され、字送り幅が ASCII と同じことを実測した文字のみ |
| 浮き | すべての部品が身体と繋がっていること（1 つの連結成分） |
| くっつき | 手は頭と横に隣接しないこと（隣接すると手に見えない） |
| 左右 | **キャラクター自身から見た向き**。桁 0 が右手・右足、桁 8 が左手 |

GUI のフォントスタックは `ui-monospace, SFMono-Regular, Menlo, ...` で、
macOS では先頭の **SF Mono** が使われる。`✻` などの星記号や `◡` は SF Mono に無く、
フォールバック描画で桁が崩れるので使えない。

これらは `src/components/Character/Character.test.tsx` でテストとして固定してある。
AA を変えてテストが落ちたら、テストではなく AA の方を直す。

### 動かす部位の役割

| 動く部位 | 状態 | 意味 |
| --- | --- | --- |
| 手 | `BLOCKED` / `DONE!` | こちらの操作を待っている |
| 足 | `BUSY` | 作業中 |
| （静止） | `IDLE` / `DONE` / `STOPPED` / `UNKNOWN` | 動かさない |

「動いている行だけを見れば、作業中か操作待ちかが分かる」ことを保つ。
静止させる状態にアニメーションを足さない。

## 構成

| ディレクトリ | 役割 |
| --- | --- |
| `src/shared/` | UI 非依存の共有資産（AA 定義・並べ替え・整形） |
| `src/core/` | 外部コマンド実行・通知・クリップボードなど副作用 |
| `src/hooks/` | 取得・差分検出・選択状態。`useSelectionCore` は入力源に依存しない |
| `src/components/` | TUI（Ink）の描画 |
| `src/gui/` | Electron の main / preload / renderer |

CLI と GUI は「取得・正規化・差分検出・並べ替え・選択状態の遷移」を共有する。
新しいロジックを足すときは、まず `src/shared/` か `src/hooks/` に置けないか検討する。

GUI の renderer は Node API を使えない。`node:*` に依存する処理は Electron の
main プロセスへ IPC で委譲する（`tsconfig.gui.json` が型検査で混入を検出する）。

## 実描画の確認

見た目を変えたら、テストだけでなく実際の描画も確認する。

```bash
# TUI
node dist/cli.js --once --all

# GUI（Chromium の CDP でスクリーンショットと実測値を取る）
ELECTRON_RUN_AS_NODE= npx electron dist/gui/main.js --remote-debugging-port=9222
# → http://127.0.0.1:9222/json/list から WebSocket で Runtime.evaluate / Page.captureScreenshot
```

OS の画面収録権限が要らないので、`Page.captureScreenshot` を使う。

### GIF の撮り直し

README 冒頭の `docs/gui.gif` は、GUI をデモ用のダミーデータで動かして撮っている。
実際に動いているセッションは状態が偏るので、見せたい状態を自分で作る。

| 手順 | 内容 |
| --- | --- |
| ダミーの一覧 | `claude` を PATH の先頭で差し替え、`agents --json` の出力を固定する。1 回目を `busy`、2 回目を `idle` にすると `DONE!` のハイライトが出る |
| プロンプト・利用率 | `HOME` をダミーへ向け、`<HOME>/.claude/projects/<cwd をエンコードした名前>/<sessionId>.jsonl` に `last-prompt` と `assistant` の `usage` を置く |
| 表示を止める | `--cc-park-config` で `highlightMs` を大きく取り、経過時間は 10 分以上にする（10 分未満は秒まで出て 1 秒ごとに変わる） |
| フレーム取得 | AA が変わるたびに `Page.captureScreenshot`。撮影前後で AA・時刻・取得中表示が揃ったものだけ採用する |
| 採用する枚数 | **連続する 6 フレーム**（`BUSY` の 6 と `BLOCKED` の 2 の最小公倍数）。そのままループになる |
| 組み立て | `magick -delay 20 -loop 0 frame-*.png -resize 480x640 -dither None -colors 128 +remap -layers Optimize docs/gui.gif`（`delay 20` = 200ms = `ANIMATION_INTERVAL_MS`） |
| 静止画 | `docs/gui.png` も同じ 1 フレーム目から作る: `magick frame-00.png -resize 480x640 -dither None -colors 256 docs/gui.png` |

`+remap` で全フレームを共通パレットに揃えないと、フレームごとにパレットが変わって
差分圧縮が効かない（284KB → 52KB）。`-dither None` は平坦な背景に出る点状のノイズを防ぐ。
