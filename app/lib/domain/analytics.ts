import type { DailySalary, ReservationType, Schedule, Shift, Stay } from '@/app/types/domain';
import { addDays, diffDays, monthRange } from './datetime';
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

/** 集計する期間。両端の日を含む 'YYYY-MM-DD' */
export interface DateRange {
  from: string;
  to: string;
}

/** 月を期間にする */
export function monthAsRange(month: string): DateRange {
  return monthRange(month);
}

/** 期間の日数（両端を含む） */
export function rangeDays(range: DateRange): number {
  return diffDays(range.from, range.to) + 1;
}

/**
 * 宿泊のうち、期間に含まれる泊数。
 * 1泊は「チェックイン日の夜」として数える（チェックアウト日の夜は含めない）。
 */
export function nightsInRange(stay: Pick<Stay, 'checkIn' | 'checkOut'>, range: DateRange): number {
  const afterLast = addDays(range.to, 1);
  const start = stay.checkIn > range.from ? stay.checkIn : range.from;
  const end = stay.checkOut < afterLast ? stay.checkOut : afterLast;
  if (start >= end) return 0;
  return stayNights({ checkIn: start, checkOut: end });
}

/** 宿泊のうち、指定した月に含まれる泊数 */
export function nightsInMonth(stay: Pick<Stay, 'checkIn' | 'checkOut'>, month: string): number {
  return nightsInRange(stay, monthAsRange(month));
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
 * 1棟の、期間（または月）の稼働率。
 *
 * ブロックは自分で売り止めにした期間なので、分母から除く。
 * 除かないと、休業した月の稼働率が不当に低く見える。
 */
export function occupancyOf(stays: Stay[], period: string | DateRange): Occupancy {
  const range = typeof period === 'string' ? monthAsRange(period) : period;
  const daysInMonth = rangeDays(range);
  let booked = 0;
  let blocked = 0;
  for (const s of stays) {
    const n = nightsInRange(s, range);
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

/** 1棟の、期間（または月）のチェックインの傾向。stays はその棟の分だけを渡す */
export function stayStatsOf(stays: Stay[], period: string | DateRange): StayStats {
  const range = typeof period === 'string' ? monthAsRange(period) : period;
  const reserved = stays.filter((s) => s.kind === 'reserved');
  const inMonth = reserved.filter((s) => s.checkIn >= range.from && s.checkIn <= range.to);
  const totalNights = inMonth.reduce((sum, s) => sum + stayNights(s), 0);
  const checkOutDays = new Set(reserved.map((s) => s.checkOut));

  return {
    checkIns: inMonth.length,
    avgNights: inMonth.length > 0 ? totalNights / inMonth.length : null,
    turnovers: inMonth.filter((s) => checkOutDays.has(s.checkIn)).length,
  };
}

/**
 * 期間（または月）の清掃の回数。
 *
 * 清掃の予定を作っても、スタッフが入らなければ清掃は行われない。
 * そのため「取り消していない清掃の予定のうち、承諾したスタッフが
 * 1人以上いるもの」を数える。2人で入っても1回と数える。
 */
export function cleaningCountOf(
  schedules: Schedule[],
  types: ReservationType[],
  shifts: Pick<Shift, 'reservationId' | 'status'>[],
  period: string | DateRange
): number {
  const range = typeof period === 'string' ? monthAsRange(period) : period;
  const cleaningTypeIds = new Set(types.filter((t) => t.isCleaning).map((t) => t.id));
  const staffed = new Set(
    shifts
      .filter((sh) => sh.status === 'accepted' && sh.reservationId !== null)
      .map((sh) => sh.reservationId as string)
  );
  return schedules.filter(
    (s) =>
      s.status === 'confirmed' &&
      s.scheduleDate >= range.from &&
      s.scheduleDate <= range.to &&
      cleaningTypeIds.has(s.typeId) &&
      staffed.has(s.id)
  ).length;
}

/**
 * 給与計算の日ごとの結果から、期間に入る日だけを合計する。
 *
 * 給与は月単位で計算する（最低保証などの判定が日ごと・月ごとにあるため）。
 * 期間が月をまたぐときは、関係する月をそれぞれ計算し、日で切り出して足す。
 * こうすると給与集計の画面の金額と食い違わない。
 */
export function laborInRange(
  days: Pick<DailySalary, 'workDate' | 'amount' | 'actualWorkMs' | 'hourlyWage'>[],
  range: DateRange
): { amount: number; workMs: number; days: number; missingWageDays: number } {
  const inRange = days.filter((d) => d.workDate >= range.from && d.workDate <= range.to);
  return {
    amount: inRange.reduce((sum, d) => sum + d.amount, 0),
    workMs: inRange.reduce((sum, d) => sum + d.actualWorkMs, 0),
    days: inRange.length,
    missingWageDays: inRange.filter((d) => d.hourlyWage === null).length,
  };
}

/** 期間が含む月の一覧（'YYYY-MM'） */
export function monthsOfRange(range: DateRange): string[] {
  return monthsBetween(range.from.slice(0, 7), range.to.slice(0, 7));
}

/** 画面から受け取った期間を確かめる。おかしければ null */
export function parseRange(
  from: string | undefined,
  to: string | undefined,
  maxDays = 366
): DateRange | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!from || !to || !re.test(from) || !re.test(to)) return null;
  // 実在しない日付（2026-02-30 など）を弾く
  if (addDays(from, 0) !== from || addDays(to, 0) !== to) return null;
  if (from > to) return null;
  if (diffDays(from, to) + 1 > maxDays) return null;
  return { from, to };
}

/** 割り算。分母が 0 なら null（「0円」と「データ無し」を区別するため） */
export function perUnit(total: number, count: number): number | null {
  return count > 0 ? total / count : null;
}

// ------------------------------------------------------------
// 曜日ごとの稼働
// ------------------------------------------------------------

export interface WeekdayOccupancy {
  /** 0=日曜 … 6=土曜 */
  weekday: number;
  bookedNights: number;
  availableNights: number;
  rate: number | null;
}

/**
 * 曜日ごとの稼働率（全棟まとめて）。
 * 「金曜の夜」は金曜にチェックインして泊まる夜のこと。ブロックの夜は分母から除く。
 */
export function weekdayOccupancy(
  stays: Stay[],
  propertyIds: string[],
  range: DateRange
): WeekdayOccupancy[] {
  const result = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    bookedNights: 0,
    availableNights: 0,
  }));

  for (const pid of propertyIds) {
    const own = stays.filter((s) => s.propertyId === pid);
    for (let d = range.from, i = 0; d <= range.to; d = addDays(d, 1), i++) {
      const wd = (dayOfWeekOf(range.from) + i) % 7;
      const covers = (s: Stay) => s.checkIn <= d && d < s.checkOut;
      if (own.some((s) => s.kind === 'blocked' && covers(s))) continue;
      result[wd].availableNights++;
      if (own.some((s) => s.kind === 'reserved' && covers(s))) result[wd].bookedNights++;
    }
  }

  return result.map((r) => ({
    ...r,
    rate: r.availableNights > 0 ? r.bookedNights / r.availableNights : null,
  }));
}

function dayOfWeekOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ------------------------------------------------------------
// 人数あたりの稼働
// ------------------------------------------------------------

export interface GuestStats {
  /** 期間内にチェックインした予約の数 */
  checkIns: number;
  /** そのうち人数を入力してある数 */
  entered: number;
  /** 1予約あたりの平均人数（入力済みの分）。無ければ null */
  avgGuests: number | null;
  /** 延べ宿泊人数（人数 × 期間内の泊数）。入力済みの分だけ */
  guestNights: number;
  /** 定員に対してどれだけ埋まったか（入力済みの宿泊について）。定員が未設定なら null */
  capacityFill: number | null;
}

/** 1棟の、期間の宿泊人数の集計。stays はその棟の分だけを渡す */
export function guestStatsOf(stays: Stay[], capacity: number | null | undefined, range: DateRange): GuestStats {
  const reserved = stays.filter((s) => s.kind === 'reserved');
  const checkedIn = reserved.filter((s) => s.checkIn >= range.from && s.checkIn <= range.to);
  const entered = checkedIn.filter((s) => s.guestCount !== null);

  let guestNights = 0;
  let capacityNights = 0;
  for (const s of reserved) {
    if (s.guestCount === null) continue;
    const n = nightsInRange(s, range);
    guestNights += s.guestCount * n;
    if (capacity) capacityNights += capacity * n;
  }

  return {
    checkIns: checkedIn.length,
    entered: entered.length,
    avgGuests:
      entered.length > 0
        ? entered.reduce((sum, s) => sum + (s.guestCount ?? 0), 0) / entered.length
        : null,
    guestNights,
    capacityFill: capacity && capacityNights > 0 ? guestNights / capacityNights : null,
  };
}

// ------------------------------------------------------------
// 売上（管理者が入力した金額）
// ------------------------------------------------------------

export interface Revenue {
  /** 期間に入る売上。入力済みの予約だけ */
  revenue: number;
  /** 金額が入っている予約の、期間内の泊数 */
  nightsWithAmount: number;
  /** 期間内の予約の泊数（金額の有無を問わず） */
  bookedNights: number;
  /** 1泊あたりの平均単価（ADR）。入力が無ければ null */
  adr: number | null;
}

/**
 * 1棟の、期間の売上。stays はその棟の分だけを渡す。
 *
 * 金額は予約全体の値なので、1泊あたりに割り、期間に入る泊数の分だけを数える。
 * 月をまたぐ予約も、それぞれの月に泊数の割合で振り分けられる。
 */
export function revenueOf(stays: Stay[], range: DateRange): Revenue {
  let revenue = 0;
  let nightsWithAmount = 0;
  let bookedNights = 0;
  for (const s of stays) {
    if (s.kind !== 'reserved') continue;
    const n = nightsInRange(s, range);
    if (n === 0) continue;
    bookedNights += n;
    if (s.amount === null || s.amount === undefined) continue;
    revenue += (s.amount / stayNights(s)) * n;
    nightsWithAmount += n;
  }
  return {
    revenue: Math.round(revenue),
    nightsWithAmount,
    bookedNights,
    adr: nightsWithAmount > 0 ? revenue / nightsWithAmount : null,
  };
}

// ------------------------------------------------------------
// 清掃にかかった時間・スタッフの負担
// ------------------------------------------------------------

export interface CleaningDuration {
  /** 計算に使えたスタッフ×清掃の数 */
  samples: number;
  /** 1人が1回の清掃にかけた平均時間（ミリ秒） */
  avgPerPersonMs: number | null;
  /** 1回の清掃にかかった延べ時間の平均（2人なら2人分の合計） */
  avgPerCleaningMs: number | null;
  /** 棟ごとの、1回の清掃の延べ時間の平均 */
  byProperty: { propertyId: string; cleanings: number; avgPerCleaningMs: number }[];
}

/**
 * 1回の清掃にかかった時間。
 *
 * 打刻はシフトと結びついていないため、「その日に清掃のシフトだけを
 * 承諾していたスタッフ」の勤務時間を、その日の清掃の数で割って求める。
 * 清掃以外のシフト（メンテナンス・棟の指定の無いシフト）もあった日は、
 * どこに何分使ったか分からないので計算から外す。
 *
 * workMsByUserDate は「ユーザーID|日付」→ その日の実働（休憩を除く）。
 */
export function cleaningDurationOf(
  schedules: Schedule[],
  types: ReservationType[],
  shifts: Pick<Shift, 'userId' | 'shiftDate' | 'reservationId' | 'status'>[],
  workMsByUserDate: Map<string, number>,
  range: DateRange
): CleaningDuration {
  const cleaningTypeIds = new Set(types.filter((t) => t.isCleaning).map((t) => t.id));
  const scheduleMap = new Map(schedules.map((s) => [s.id, s]));

  // ユーザー×日付ごとに、承諾したシフトをまとめる
  const byUserDate = new Map<string, Pick<Shift, 'reservationId'>[]>();
  for (const sh of shifts) {
    if (sh.status !== 'accepted') continue;
    if (sh.shiftDate < range.from || sh.shiftDate > range.to) continue;
    const key = `${sh.userId}|${sh.shiftDate}`;
    const list = byUserDate.get(key);
    if (list) list.push(sh);
    else byUserDate.set(key, [sh]);
  }

  // 清掃の予定ごとに、かかった人×時間を足していく
  const perCleaning = new Map<string, { propertyId: string; ms: number; people: number }>();
  let personSamples = 0;
  let personMs = 0;

  for (const [key, list] of byUserDate) {
    const linked = list.map((sh) => (sh.reservationId ? scheduleMap.get(sh.reservationId) : undefined));
    const allCleaning = linked.every(
      (sc) => sc !== undefined && sc.status === 'confirmed' && cleaningTypeIds.has(sc.typeId)
    );
    const workMs = workMsByUserDate.get(key) ?? 0;
    if (!allCleaning || workMs <= 0) continue;

    const share = workMs / linked.length;
    for (const sc of linked) {
      if (!sc) continue;
      const entry = perCleaning.get(sc.id) ?? { propertyId: sc.propertyId, ms: 0, people: 0 };
      entry.ms += share;
      entry.people += 1;
      perCleaning.set(sc.id, entry);
      personSamples++;
      personMs += share;
    }
  }

  const cleanings = [...perCleaning.values()];
  const byPropertyMap = new Map<string, { cleanings: number; ms: number }>();
  for (const c of cleanings) {
    const e = byPropertyMap.get(c.propertyId) ?? { cleanings: 0, ms: 0 };
    e.cleanings++;
    e.ms += c.ms;
    byPropertyMap.set(c.propertyId, e);
  }

  return {
    samples: personSamples,
    avgPerPersonMs: personSamples > 0 ? personMs / personSamples : null,
    avgPerCleaningMs:
      cleanings.length > 0 ? cleanings.reduce((s, c) => s + c.ms, 0) / cleanings.length : null,
    byProperty: [...byPropertyMap.entries()].map(([propertyId, e]) => ({
      propertyId,
      cleanings: e.cleanings,
      avgPerCleaningMs: e.ms / e.cleanings,
    })),
  };
}

/** スタッフごとの、期間に入った清掃の回数（承諾したもの） */
export function cleaningsByStaff(
  schedules: Schedule[],
  types: ReservationType[],
  shifts: Pick<Shift, 'userId' | 'reservationId' | 'status'>[],
  range: DateRange
): Map<string, number> {
  const cleaningTypeIds = new Set(types.filter((t) => t.isCleaning).map((t) => t.id));
  const cleaningIds = new Set(
    schedules
      .filter(
        (s) =>
          s.status === 'confirmed' &&
          s.scheduleDate >= range.from &&
          s.scheduleDate <= range.to &&
          cleaningTypeIds.has(s.typeId)
      )
      .map((s) => s.id)
  );
  const result = new Map<string, number>();
  for (const sh of shifts) {
    if (sh.status !== 'accepted' || !sh.reservationId || !cleaningIds.has(sh.reservationId)) continue;
    result.set(sh.userId, (result.get(sh.userId) ?? 0) + 1);
  }
  return result;
}
