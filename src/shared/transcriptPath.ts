/**
 * セッション transcript（JSONL）の置き場所を組み立てる。
 *
 * Claude Code は `~/.claude/projects/<cwd をエンコードした名前>/<sessionId>.jsonl` に
 * 会話ログを追記する。この対応は非公開仕様なので、見つからない場合に呼び出し側が
 * 諦められるよう、ここではパスを組み立てるだけで存在確認はしない。
 *
 * `node:path` / `node:os` に依存させず、GUI renderer からも使えるようにしてある。
 */

/** transcript の置き場所を `~/.claude` 起点で表したときの相対ディレクトリ。 */
const PROJECTS_DIR = '.claude/projects';

/**
 * cwd をプロジェクトディレクトリ名へ変換する。
 * 英数字以外はすべて `-` に置き換わる（`/Users/foo/bar` → `-Users-foo-bar`）。
 */
export const encodeProjectDir = (cwd: string): string => cwd.replace(/[^a-zA-Z0-9]/g, '-');

/** transcript ファイルのパスを組み立てる。cwd が空なら特定できないので null を返す。 */
export const buildTranscriptPath = (
  home: string,
  cwd: string,
  sessionId: string,
): string | null => {
  if (home === '' || cwd === '' || sessionId === '') {
    return null;
  }
  return `${home}/${PROJECTS_DIR}/${encodeProjectDir(cwd)}/${sessionId}.jsonl`;
};
