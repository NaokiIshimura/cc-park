interface FooterProps {
  readonly message: string | null;
}

/** キーと操作名の組。組の途中では折り返さない（`通` と `知` が別の行に割れないようにする）。 */
const KEY_HELP: readonly (readonly [key: string, label: string])[] = [
  ['↑/↓', '選択'],
  ['Enter', '開く'],
  ['c', 'コピー'],
  ['s', 'stop'],
  ['x', 'kill'],
  ['r', '更新'],
  ['n', '通知'],
  ['f', '操作待ち'],
  ['/', '検索'],
  ['t', '最前面'],
  ['o', '透過'],
  ['m', 'ミニ'],
  ['a', '予約'],
  ['q', '終了'],
];

/** キーバインドヘルプと直近の操作結果を表示する。 */
export const Footer = ({ message }: FooterProps) => (
  <footer className="footer">
    <p className="footer__help">
      {KEY_HELP.map(([key, label]) => (
        <span key={key} className="footer__key">
          {key} {label}
        </span>
      ))}
    </p>
    {message === null ? null : <p className="footer__message">{message}</p>}
  </footer>
);
