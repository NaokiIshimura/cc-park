import type { FetchError } from '../../../../core/fetchAgents.js';

/** エラー種別ごとの対処法。 */
const HINTS: Readonly<Record<FetchError['kind'], string>> = {
  'not-found': 'claude コマンドが PATH に含まれているか確認してください。',
  timeout: '端末の負荷が高い可能性があります。--interval を長くして再試行してください。',
  exit: 'claude agents --json を手動で実行し、エラー内容を確認してください。',
  parse: 'claude のバージョンによって出力形式が変わった可能性があります。',
  aborted: '取得を中断しました。',
};

interface ErrorViewProps {
  readonly error: FetchError;
}

/** 取得失敗時のメッセージと対処法を表示する。 */
export const ErrorView = ({ error }: ErrorViewProps) => (
  <div className="error-view" role="alert">
    <p className="error-view__title">セッション一覧を取得できませんでした</p>
    <p className="error-view__message">{error.message}</p>
    <p className="error-view__hint">{HINTS[error.kind]}</p>
  </div>
);
