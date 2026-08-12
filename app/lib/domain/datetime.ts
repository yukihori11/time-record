// 日付境界は全て日本時間で判定する。
// 手計算のオフセット加算は夏時間や実行環境のTZに影響されるため、
// Intl.DateTimeFormat の en-CA（YYYY-MM-DD 形式）を使う。

const JST = 'Asia/Tokyo';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: JST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: JST,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Date → 'YYYY-MM-DD'（JST） */
export function toJstDateString(date: Date): string {
  return dateFormatter.format(date);
}

/** Date → 'HH:MM'（JST） */
export function toJstTimeString(date: Date): string {
  return timeFormatter.format(date);
}

/** 'YYYY-MM' → その月の日付文字列の配列 */
export function monthDays(month: string): string[] {
  const [year, mon] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const days: string[] = [];
  for (let d = 1; d <= last; d++) {
    days.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

/** 'YYYY-MM' → { from: 'YYYY-MM-01', to: 'YYYY-MM-末日' } */
export function monthRange(month: string): { from: string; to: string } {
  const days = monthDays(month);
  return { from: days[0], to: days[days.length - 1] };
}

/** 'YYYY-MM-DD' に日数を加算 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** 2つの日付文字列の差（日数）。to - from */
export function diffDays(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}

/** 'YYYY-MM-DD' の曜日（0=日曜） */
export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 今日（JST）の 'YYYY-MM-DD' */
export function todayJst(now: Date = new Date()): string {
  return toJstDateString(now);
}

/**
 * その日がもう過ぎているか（JST基準）。
 *
 * 当日は「過ぎていない」とする。朝に承諾を取り消したい
 * ことはあるため。サーバー側（0027）も同じ判定にしてある。
 */
export function isPast(dateStr: string, now: Date = new Date()): boolean {
  return dateStr < todayJst(now);
}

/** 'YYYY-MM-DD' → 'M月D日(曜)' */
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDateJa(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}月${d}日(${WEEKDAYS[dayOfWeek(dateStr)]})`;
}

export function formatMonthJa(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}年${m}月`;
}
