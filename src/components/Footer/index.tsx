import { Box, Text } from 'ink';

interface FooterProps {
  readonly message: string | null;
  /** 通知・クリップボードが使えない環境で注意書きを出す */
  readonly showPlatformNotice: boolean;
  /** 検索語を入力中なら入力欄を出す。入力中でなければ null */
  readonly searchInput?: string | null;
}

const KEY_HELP =
  'up/down 選択  c コピー  s stop  x kill  r 更新  n 通知  f 操作待ち  / 検索  q 終了';

/** キーバインドヘルプと直近の操作結果を表示する。 */
export const Footer = ({ message, showPlatformNotice, searchInput = null }: FooterProps) => (
  <Box flexDirection="column">
    {searchInput === null ? (
      <Text dimColor>{KEY_HELP}</Text>
    ) : (
      <Text>
        <Text color="cyan">{`/${searchInput}`}</Text>
        <Text inverse> </Text>
        <Text dimColor>  Enter 確定  Esc 取消</Text>
      </Text>
    )}
    {showPlatformNotice ? (
      <Text color="yellow">通知とクリップボードは macOS のみ対応しています</Text>
    ) : null}
    {message === null ? null : <Text color="green">{message}</Text>}
  </Box>
);
