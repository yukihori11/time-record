import type { BreakRecord, WorkSession } from '@/app/types/domain';

interface Interval {
  start: number;
  end: number;
}

/**
 * 重なり合う区間をマージする。
 *
 * 管理者の後修正で休憩が重複した場合に、
 * 二重計上して実労働がマイナスになるのを防ぐ。
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  if (sorted.length === 0) return [];

  const merged: Interval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }

  return merged;
}

/**
 * 休憩の合計時間（ミリ秒）。
 *
 * 進行中の休憩（breakEnd が null）は now までを計上する。
 */
export function totalBreakMs(breaks: BreakRecord[], now: Date): number {
  const nowMs = now.getTime();

  const intervals = breaks.map((b) => ({
    start: b.breakStart.getTime(),
    end: b.breakEnd ? b.breakEnd.getTime() : nowMs,
  }));

  return mergeIntervals(intervals).reduce(
    (sum, i) => sum + (i.end - i.start),
    0
  );
}

/**
 * 実労働時間（ミリ秒）= 勤務時間 − 休憩。
 *
 * 勤務中（clockOut が null）の場合は now までを計算する。
 * これにより画面を閉じて開き直しても正しい経過時間が出る。
 *
 * 不正なデータ（退勤 < 出勤、休憩が勤務時間を超える）でも
 * 例外を投げず 0 にクランプする。給与画面が落ちないことを優先。
 */
export function actualWorkMs(session: WorkSession, now: Date): number {
  const start = session.clockIn.getTime();
  const end = session.clockOut ? session.clockOut.getTime() : now.getTime();

  const gross = end - start;
  if (gross <= 0) return 0;

  // 休憩が勤務時間の外にはみ出していても内側だけを数える
  const clamped = session.breaks.map((b) => ({
    ...b,
    breakStart: new Date(Math.max(b.breakStart.getTime(), start)),
    breakEnd: b.breakEnd
      ? new Date(Math.min(b.breakEnd.getTime(), end))
      : new Date(end),
  }));

  const breakMs = totalBreakMs(clamped, now);
  return Math.max(0, gross - breakMs);
}

/** 勤務全体の長さ（休憩を含む） */
export function grossWorkMs(session: WorkSession, now: Date): number {
  const start = session.clockIn.getTime();
  const end = session.clockOut ? session.clockOut.getTime() : now.getTime();
  return Math.max(0, end - start);
}
