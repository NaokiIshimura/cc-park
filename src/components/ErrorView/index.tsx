import { Box, Text } from 'ink';
import type { FetchError } from '../../core/fetchAgents.js';

interface ErrorViewProps {
  readonly error: FetchError;
}

/** エラー種別ごとの対処法。 */
const HINTS: Readonly<Record<FetchError['kind'], string>> = {
  'not-found': 'claude コマンドが PATH に含まれているか確認してください。',
  timeout: '端末の負荷が高い可能性があります。--interval を長くして再試行してください。',
  exit: 'claude agents --json を手動で実行し、エラー内容を確認してください。',
  parse: 'claude のバージョンによって出力形式が変わった可能性があります。',
  aborted: '取得を中断しました。',
};

/** 取得失敗時のメッセージと対処法を表示する。 */
export const ErrorView = ({ error }: ErrorViewProps) => (
  <Box flexDirection="column" paddingY={1}>
    <Text color="red" bold>
      セッション一覧を取得できませんでした
    </Text>
    <Text color="red">{error.message}</Text>
    <Text dimColor>{HINTS[error.kind]}</Text>
  </Box>
);
