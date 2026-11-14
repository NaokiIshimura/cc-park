import { Box, Text } from 'ink';

interface EmptyStateProps {
  /** 絞り込みで 0 件になったか。稼働中のセッションが無いときとは案内を変える */
  readonly filtered?: boolean;
}

/** 表示するセッションが 0 件のときの表示。 */
export const EmptyState = ({ filtered = false }: EmptyStateProps) =>
  filtered ? (
    <Box flexDirection="column" paddingY={1}>
      <Text dimColor>条件に合うセッションはありません。</Text>
      <Text dimColor>f で操作待ちの絞り込みを、Esc で検索を解除できます。</Text>
    </Box>
  ) : (
    <Box flexDirection="column" paddingY={1}>
      <Text dimColor>稼働中の Claude Code セッションはありません。</Text>
      <Text dimColor>別のターミナルで claude を起動すると、ここに表示されます。</Text>
    </Box>
  );
