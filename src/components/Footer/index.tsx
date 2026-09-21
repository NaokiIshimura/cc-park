import { Box, Text } from 'ink';

interface FooterProps {
  readonly message: string | null;
  /** 通知・クリップボードが使えない環境で注意書きを出す */
  readonly showPlatformNotice: boolean;
}

const KEY_HELP = 'up/down 選択  c コピー  s stop  x kill  r 更新  n 通知  q 終了';

/** キーバインドヘルプと直近の操作結果を表示する。 */
export const Footer = ({ message, showPlatformNotice }: FooterProps) => (
  <Box flexDirection="column">
    <Text dimColor>{KEY_HELP}</Text>
    {showPlatformNotice ? (
      <Text color="yellow">通知とクリップボードは macOS のみ対応しています</Text>
    ) : null}
    {message === null ? null : <Text color="green">{message}</Text>}
  </Box>
);
