import type {
  DailySalary,
  HourlyWage,
  MonthlySalary,
  PayrollSettings,
  WorkSession,
} from '@/app/types/domain';
import { roundMinutes } from './rounding';
import { resolveWage } from './wage-history';
import { actualWorkMs, totalBreakMs } from './worktime';

/**
 * 給与計算の中核。
 *
 * ルール:
 *   実労働 = (退勤 − 出勤) − 休憩合計
 *   請求分 = max(最低保証, 15分単位に丸めた実労働)
 *   金額   = 請求分(分) / 60 × 時給   ← 円未満は切り捨て
 *
 * 丸めと最低保証は「1日あたり」で適用する。
 * 1日に複数回出勤しても保証は1回だけ。
 *
 * max を分単位で取ってから時給を掛けることで、
 * 「保証額と実額をそれぞれ計算して比較」するより丸め誤差が出ない。
 */

export const DEFAULT_SETTINGS: PayrollSettings = {
  roundingMode: 'up',
  roundingMinutes: 15,
  minGuaranteedMinutes: 120,
};

/** 分と時給から金額を出す。円未満は切り捨て。 */
export function amountFromMinutes(minutes: number, hourlyWage: number): number {
  if (minutes <= 0 || hourlyWage <= 0) return 0;
  return Math.floor((minutes * hourlyWage) / 60);
}

/**
 * 1日分の給与を計算する。
 *
 * 同じ日に複数のセッションがある場合は実労働を合算してから
 * 丸めと最低保証を適用する（1日あたりのルールのため）。
 */
export function calcDailySalary(input: {
  workDate: string;
  sessions: WorkSession[];
  hourlyWage: number | null;
  settings: PayrollSettings;
  now: Date;
}): DailySalary {
  const { workDate, sessions, hourlyWage, settings, now } = input;

  const validSessions = sessions.filter((s) => s.status !== 'cancelled');

  let workMs = 0;
  let breakMs = 0;

  for (const s of validSessions) {
    workMs += actualWorkMs(s, now);
    breakMs += totalBreakMs(s.breaks, now);
  }

  const actualMinutes = workMs / 60_000;

  const rounded = roundMinutes(
    actualMinutes,
    settings.roundingMinutes,
    settings.roundingMode
  );

  // 一度も出勤していない日に保証を出さない
  const guaranteed = workMs > 0 ? settings.minGuaranteedMinutes : 0;
  const billed = Math.max(guaranteed, rounded);

  return {
    workDate,
    sessionIds: validSessions.map((s) => s.id),
    actualWorkMs: workMs,
    actualWorkMinutes: actualMinutes,
    roundedMinutes: rounded,
    billedMinutes: billed,
    isGuaranteeApplied: workMs > 0 && guaranteed > rounded,
    breakMs,
    hourlyWage,
    amount: hourlyWage ? amountFromMinutes(billed, hourlyWage) : 0,
  };
}

/**
 * 月次の給与を計算する。
 *
 * work_date でグループ化するので、22時開始・翌6時退勤の夜勤も
 * 開始日の勤務として正しく計上される。
 * 3/31 22:00 → 4/1 6:00 は3月分。
 */
export function calcMonthlySalary(input: {
  month: string; // YYYY-MM
  sessions: WorkSession[];
  wageHistory: HourlyWage[];
  settings: PayrollSettings;
  now: Date;
}): MonthlySalary {
  const { month, sessions, wageHistory, settings, now } = input;

  const inMonth = sessions.filter((s) => s.workDate.startsWith(month));

  const byDate = new Map<string, WorkSession[]>();
  for (const s of inMonth) {
    const list = byDate.get(s.workDate);
    if (list) {
      list.push(s);
    } else {
      byDate.set(s.workDate, [s]);
    }
  }

  const days: DailySalary[] = [];
  const missingWageDates: string[] = [];

  for (const workDate of Array.from(byDate.keys()).sort()) {
    const wage = resolveWage(wageHistory, workDate);
    if (wage === null) {
      missingWageDates.push(workDate);
    }

    days.push(
      calcDailySalary({
        workDate,
        sessions: byDate.get(workDate)!,
        hourlyWage: wage,
        settings,
        now,
      })
    );
  }

  return {
    month,
    days,
    totalAmount: days.reduce((sum, d) => sum + d.amount, 0),
    totalWorkMs: days.reduce((sum, d) => sum + d.actualWorkMs, 0),
    totalBreakMs: days.reduce((sum, d) => sum + d.breakMs, 0),
    totalBilledMinutes: days.reduce((sum, d) => sum + d.billedMinutes, 0),
    missingWageDates,
  };
}
