interface EmptyStateProps {
  /** 絞り込みで 0 件になったか。稼働中のセッションが無いときとは案内を変える */
  readonly filtered?: boolean;
}

/** 表示するセッションが 0 件のときの表示。 */
export const EmptyState = ({ filtered = false }: EmptyStateProps) =>
  filtered ? (
    <div className="empty-state">
      <p>条件に合うセッションはありません。</p>
      <p>f で操作待ちの絞り込みを、Esc で検索を解除できます。</p>
    </div>
  ) : (
    <div className="empty-state">
      <p>稼働中の Claude Code セッションはありません。</p>
      <p>別のターミナルで claude を起動すると、ここに表示されます。</p>
    </div>
  );
