/** タイムスタンプを時刻表示（HH:MM:SS）へ整形する。 */
export const formatClock = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString('ja-JP', { hour12: false });
