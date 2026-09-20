import { homedir } from 'node:os';

/**
 * 作業ディレクトリを表示用に短縮する。
 * ホームディレクトリを `~` に置き換え、maxWidth を超える場合は先頭を `…` で中略する。
 */
export const formatCwd = (
  cwd: string,
  maxWidth = 40,
  home: string = homedir(),
): string => {
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
