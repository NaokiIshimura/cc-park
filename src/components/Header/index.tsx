import { Box, Text } from 'ink';

interface HeaderProps {
  readonly count: number;
  readonly lastUpdatedAt: number | null;
  readonly notifyEnabled: boolean;
  readonly isFetching: boolean;
}

const formatClock = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString('ja-JP', { hour12: false });

/** タイトル・件数・最終更新時刻・通知状態を表示する。 */
export const Header = ({ count, lastUpdatedAt, notifyEnabled, isFetching }: HeaderProps) => (
  <Box flexDirection="row" gap={1} justifyContent="space-between">
    <Box flexDirection="row" gap={1}>
      <Text bold color="cyan">
        cc-park
      </Text>
      <Text dimColor>{`${count} sessions`}</Text>
    </Box>
    <Box flexDirection="row" gap={1}>
      <Text color={notifyEnabled ? 'green' : 'gray'} bold={notifyEnabled} dimColor={!notifyEnabled}>
        {notifyEnabled ? 'notify:ON' : 'notify:off'}
      </Text>
      <Text dimColor>
        {lastUpdatedAt === null ? 'updating...' : formatClock(lastUpdatedAt)}
      </Text>
      <Text color="cyan">{isFetching ? '*' : ' '}</Text>
    </Box>
  </Box>
);
