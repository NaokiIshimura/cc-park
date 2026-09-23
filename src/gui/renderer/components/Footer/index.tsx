interface FooterProps {
  readonly message: string | null;
}

const KEY_HELP = '↑/↓ 選択  c コピー  s stop  x kill  r 更新  n 通知  t 最前面  a 予約  q 終了';

/** キーバインドヘルプと直近の操作結果を表示する。 */
export const Footer = ({ message }: FooterProps) => (
  <footer className="footer">
    <p className="footer__help">{KEY_HELP}</p>
    {message === null ? null : <p className="footer__message">{message}</p>}
  </footer>
);
