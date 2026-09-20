/** セッションを再開するコマンド文字列を組み立てる。 */
export const buildResumeCommand = (sessionId: string): string => `claude --resume ${sessionId}`;
