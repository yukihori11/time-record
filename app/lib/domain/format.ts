/** ミリ秒 → 「2時間30分」 */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return '0分';

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours}時間${minutes}分`;
  if (hours > 0) return `${hours}時間`;
  return `${minutes}分`;
}

/** 分 → 「2時間30分」 */
export function formatMinutes(minutes: number): string {
  return formatDuration(minutes * 60_000);
}

/** ミリ秒 → 「02:30:45」（タイマー表示用） */
export function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/** 数値 → 「1,250円」 */
export function formatYen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}
