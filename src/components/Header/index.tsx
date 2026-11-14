import { Box, Text } from 'ink';
import { formatClock } from '../../shared/formatClock.js';
import { formatCount } from '../../shared/filterAgents.js';

interface HeaderProps {
  readonly count: number;
  /** 絞り込む前の件数。省略時は `count` と同じ（絞り込んでいない） */
  readonly total?: number;
  /** 絞り込みの内容（`[操作待ち] /foo` など）。絞り込んでいなければ空文字 */
  readonly filterLabel?: string;
  readonly lastUpdatedAt: number | null;
  readonly notifyEnabled: boolean;
  readonly isFetching: boolean;
}

/** タイトル・件数・最終更新時刻・通知状態を表示する。 */
export const Header = ({
  count,
  total = count,
  filterLabel = '',
  lastUpdatedAt,
  notifyEnabled,
  isFetching,
}: HeaderProps) => (
  <Box flexDirection="row" gap={1} justifyContent="space-between">
    <Box flexDirection="row" gap={1}>
      <Text bold color="cyan">
        CC Park
      </Text>
      <Text dimColor>{formatCount(count, total)}</Text>
      {filterLabel === '' ? null : <Text color="yellow">{filterLabel}</Text>}
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
