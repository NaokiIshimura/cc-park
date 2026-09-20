import { useEffect, useState } from 'react';
import { useStdout } from 'ink';

/** 端末サイズが取れない場合の既定値 */
export const FALLBACK_COLUMNS = 80;
export const FALLBACK_ROWS = 24;

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

const readSize = (stdout: NodeJS.WriteStream | undefined): TerminalSize => ({
  columns: stdout?.columns ?? FALLBACK_COLUMNS,
  rows: stdout?.rows ?? FALLBACK_ROWS,
});

/** 端末の桁数・行数を取得し、リサイズに追従する。 */
export const useTerminalSize = (): TerminalSize => {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => readSize(stdout));

  useEffect(() => {
    if (stdout === undefined) {
      return;
    }
    const onResize = () => {
      setSize(readSize(stdout));
    };
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return size;
};
