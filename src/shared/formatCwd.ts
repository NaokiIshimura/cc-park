/**
 * 作業ディレクトリを表示用に短縮する。
 * ホームディレクトリを `~` に置き換え、maxWidth を超える場合は先頭を `…` で中略する。
 *
 * TUI / GUI の双方から使えるよう、ホームディレクトリの解決は呼び出し側に委ねる
 * （`node:os` に依存しない）。既定値つきの入口は `utils/formatCwd.ts` にある。
 */
export const formatCwd = (cwd: string, maxWidth: number, home: string): string => {
  if (cwd === '') {
    return '-';
  }

  let shortened = cwd;
  if (home !== '' && (cwd === home || cwd.startsWith(`${home}/`))) {
    shortened = `~${cwd.slice(home.length)}`;
  }

  if (maxWidth <= 1 || shortened.length <= maxWidth) {
    return shortened;
  }

  return `…${shortened.slice(shortened.length - (maxWidth - 1))}`;
};
