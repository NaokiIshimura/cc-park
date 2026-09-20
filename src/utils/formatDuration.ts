/**
 * 経過ミリ秒を人間が読みやすい形式に整形する。
 * 例: 3m12s / 18m / 2h5m / 3d4h
 */
export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) {
    return '-';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);

  if (days > 0) {
    return `${days}d${hours}h`;
  }
  if (totalHours > 0) {
    return `${totalHours}h${minutes}m`;
  }
  if (totalMinutes > 0) {
    // 分単位まで来たら秒は省き、1分未満の粒度は落とす
    return seconds > 0 && totalMinutes < 10 ? `${totalMinutes}m${seconds}s` : `${totalMinutes}m`;
  }
  return `${seconds}s`;
};
