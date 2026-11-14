# `claude agents --json` の出力サンプル

`claude agents --json` の出力仕様は公開されていないので、実際に見た出力をここに残し、
正規化（`src/core/normalizeAgent.ts`）のテストで使う。出力の形が変わったら、ここに足して
テストを通すところから直す。

個人の情報（パス・セッション ID・名前）は置き換えてある。形と値の種類だけを保つ。

| ファイル | 出どころ | 内容 |
| --- | --- | --- |
| `interactive-busy.json` | Claude Code 2.1.325 の実際の出力 | interactive セッション 1 件（`status: busy`） |
| `background.json` | #25・#27 の修正で確かめた形 | background の承認待ち（`status: waiting` / `state: blocked`）と作業中（`status: busy` / `state: working`） |

`cc-park --debug` で起動すると、受け取った出力が `~/.cc-park/debug/agents.json` に保存される。
新しい形を見つけたら、匿名化してここに足す。
