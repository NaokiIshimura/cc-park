/**
 * README のインストール手順に書いたダウンロード URL のバージョンを扱う。
 *
 * 手順はコピーしてそのまま実行できるように、バージョンを固定値で書いている。
 * `npm version` で `package.json` の `version` を上げると、`scripts/sync-readme-version.ts`
 * がこの関数で README を書き換える。食い違いは `readmeVersion.test.ts` が検出する。
 */

/** Releases のダウンロード URL のうち、バージョンが入る部分。 */
const DOWNLOAD_URL = /\/releases\/download\/v([^/\s]+)\/cc-park-([^/\s]+?)-darwin-/g;

/** 文中のダウンロード URL に書かれたバージョンをすべて返す（タグとファイル名の両方）。 */
export function findDownloadVersions(text: string): string[] {
  return [...text.matchAll(DOWNLOAD_URL)].flatMap((m) => [m[1] ?? '', m[2] ?? '']);
}

/** 文中のダウンロード URL のバージョンを `version` に置き換える。 */
export function replaceDownloadVersion(text: string, version: string): string {
  return text.replace(DOWNLOAD_URL, `/releases/download/v${version}/cc-park-${version}-darwin-`);
}
