import { useEffect, useRef } from 'react';

interface SearchBarProps {
  readonly query: string;
  /** 入力欄にフォーカスを移すか。`/` で開いたときに true */
  readonly focused: boolean;
  readonly onChange: (query: string) => void;
  /** Enter・↓ で入力を確定し、一覧の操作へ戻る */
  readonly onCommit: () => void;
  /** Esc で検索語を消して閉じる */
  readonly onClear: () => void;
  readonly onFocus: () => void;
  /** 欄の外をクリックしたとき。入力をやめて一覧の操作へ戻す */
  readonly onBlur: () => void;
}

/**
 * 一覧の検索欄。`/` で開き、名前・ディレクトリ・最終プロンプト・起動元で絞り込む。
 * 入力中は一覧のキー操作を止める（呼び出し側が `onFocus` / `onCommit` で切り替える）。
 */
export const SearchBar = ({
  query,
  focused,
  onChange,
  onCommit,
  onClear,
  onFocus,
  onBlur,
}: SearchBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focused) {
      inputRef.current?.focus();
    } else {
      inputRef.current?.blur();
    }
  }, [focused]);

  return (
    <div className="search-bar">
      <span className="search-bar__mark" aria-hidden="true">
        /
      </span>
      <input
        ref={inputRef}
        className="search-bar__input"
        type="search"
        aria-label="セッションを検索"
        placeholder="名前・ディレクトリ・プロンプトで絞り込む"
        value={query}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClear();
            return;
          }
          if (event.key === 'Enter' || event.key === 'ArrowDown') {
            event.preventDefault();
            onCommit();
          }
        }}
      />
      <button type="button" className="button" onClick={onClear}>
        解除
      </button>
    </div>
  );
};
