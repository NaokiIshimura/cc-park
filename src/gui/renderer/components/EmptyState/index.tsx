/** 稼働中セッションが 0 件のときの表示。 */
export const EmptyState = () => (
  <div className="empty-state">
    <p>稼働中の Claude Code セッションはありません。</p>
    <p>別のターミナルで claude を起動すると、ここに表示されます。</p>
  </div>
);
