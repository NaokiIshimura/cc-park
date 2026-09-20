import { homedir } from 'node:os';
import { formatCwd as formatCwdWith } from '../shared/formatCwd.js';

/**
 * 作業ディレクトリを表示用に短縮する（Node 環境向けの入口）。
 * ホームディレクトリの既定値だけを解決し、整形そのものは共有実装に委ねる。
 */
export const formatCwd = (cwd: string, maxWidth = 40, home: string = homedir()): string =>
  formatCwdWith(cwd, maxWidth, home);
