import { execFile } from 'node:child_process';

/** 外部コマンド実行の抽象。テストで差し替えられるようにしている。 */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: { readonly timeoutMs: number; readonly signal: AbortSignal | undefined },
) => Promise<string>;

/** 外部コマンド実行で起こりうる失敗の種別。 */
export type CommandErrorKind = 'not-found' | 'timeout' | 'exit' | 'aborted';

export interface CommandError {
  readonly kind: CommandErrorKind;
  readonly message: string;
}

const MAX_BUFFER = 10 * 1024 * 1024;

/** execFile ベースの既定ランナー。シェルを経由しないので引数のエスケープ不要。 */
export const execFileRunner: CommandRunner = (command, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        timeout: options.timeoutMs,
        maxBuffer: MAX_BUFFER,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });

/**
 * 外部コマンドの失敗を種別へ分類する。
 * UI 側で対処法を出し分けられるよう、メッセージだけでなく kind を持たせる。
 */
export const toCommandError = (error: unknown, timeoutMessage: string): CommandError => {
  const candidate = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
  const message = candidate?.message ?? String(error);

  if (candidate?.code === 'ENOENT') {
    return {
      kind: 'not-found',
      message: 'claude コマンドが見つかりません。PATH を確認してください。',
    };
  }
  if (candidate?.name === 'AbortError') {
    return { kind: 'aborted', message: '処理を中断しました。' };
  }
  if (candidate?.killed === true || candidate?.signal === 'SIGTERM') {
    return { kind: 'timeout', message: timeoutMessage };
  }
  return { kind: 'exit', message };
};
