import type { ReservationType, Schedule, Stay } from '@/app/types/domain';
import { addDays, monthDays } from './datetime';
import { stayNights } from './stays';

// 管理者向けの分析の計算。画面や DB から切り離してテストで確かめる。
//
// 宿泊は Airbnb の iCal から取り込んだものだけが元になる。
// 取り込みを始める前の月や、iCal に出てこない古い期間は数えられない。

/** 'YYYY-MM' に月数を足す */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** from から to まで（両端を含む）の月の一覧 */
export function monthsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) result.push(m);
  return result;
}

/**
 * 宿泊のうち、指定した月に含まれる泊数。
 * 1泊は「チェックイン日の夜」として数える（チェックアウト日の夜は含めない）。
 */
export function nightsInMonth(stay: Pick<Stay, 'checkIn' | 'checkOut'>, month: string): number {
  const days = monthDays(month);
  const first = days[0];
  const afterLast = addDays(days[days.length - 1], 1);
  const start = stay.checkIn > first ? stay.checkIn : first;
  const end = stay.checkOut < afterLast ? stay.checkOut : afterLast;
  if (start >= end) return 0;
  return stayNights({ checkIn: start, checkOut: end });
}

export interface Occupancy {
  /** 予約で埋まった泊数 */
  bookedNights: number;
  /** ブロック（売り止め）の泊数 */
  blockedNights: number;
  /** 売り出していた泊数（月の日数 − ブロック） */
  availableNights: number;
  /** 稼働率（0〜1）。売り出していた日が無ければ null */
  rate: number | null;
}

/**
 * 1棟・1か月の稼働率。
 *
 * ブロックは自分で売り止めにした期間なので、分母から除く。
 * 除かないと、休業した月の稼働率が不当に低く見える。
 */
export function occupancyOf(stays: Stay[], month: string): Occupancy {
  const daysInMonth = monthDays(month).length;
  let booked = 0;
  let blocked = 0;
  for (const s of stays) {
    const n = nightsInMonth(s, month);
    if (s.kind === 'reserved') booked += n;
    else blocked += n;
  }
  // 予約とブロックが重なることは通常無いが、念のため日数を超えないようにする
  blocked = Math.min(blocked, daysInMonth);
  const available = daysInMonth - blocked;
  return {
    bookedNights: booked,
    blockedNights: blocked,
    availableNights: available,
    rate: available > 0 ? Math.min(1, booked / available) : null,
  };
}

export interface StayStats {
  /** その月にチェックインした予約の数 */
  checkIns: number;
  /** その月にチェックインした予約の平均泊数。予約が無ければ null */
  avgNights: number | null;
  /** 前の客が出た日に次の客が入った回数（清掃が慌ただしい日） */
  turnovers: number;
}

/** 1棟・1か月のチェックインの傾向。stays はその棟の分だけを渡す */
export function stayStatsOf(stays: Stay[], month: string): StayStats {
  const reserved = stays.filter((s) => s.kind === 'reserved');
  const inMonth = reserved.filter((s) => s.checkIn.startsWith(month));
  const totalNights = inMonth.reduce((sum, s) => sum + stayNights(s), 0);
  const checkOutDays = new Set(reserved.map((s) => s.checkOut));

  return {
    checkIns: inMonth.length,
    avgNights: inMonth.length > 0 ? totalNights / inMonth.length : null,
    turnovers: inMonth.filter((s) => checkOutDays.has(s.checkIn)).length,
  };
}

/** その月の清掃の回数（取り消していない、清掃の種別の予定） */
export function cleaningCountOf(
  schedules: Schedule[],
  types: ReservationType[],
  month: string
): number {
  const cleaningTypeIds = new Set(types.filter((t) => t.isCleaning).map((t) => t.id));
  return schedules.filter(
    (s) =>
      s.status === 'confirmed' &&
      s.scheduleDate.startsWith(month) &&
      cleaningTypeIds.has(s.typeId)
  ).length;
}

/** 割り算。分母が 0 なら null（「0円」と「データ無し」を区別するため） */
export function perUnit(total: number, count: number): number | null {
  return count > 0 ? total / count : null;
}
