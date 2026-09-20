import { Box, Text } from 'ink';

/** 稼働中セッションが 0 件のときの表示。 */
export const EmptyState = () => (
  <Box flexDirection="column" paddingY={1}>
    <Text dimColor>稼働中の Claude Code セッションはありません。</Text>
    <Text dimColor>別のターミナルで claude を起動すると、ここに表示されます。</Text>
  </Box>
);
