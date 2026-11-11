import 'server-only';

import AppHeader from '@/app/components/layout/AppHeader';
import { guardAdminPage } from '@/app/lib/server/page-guard';
import {
  SESSION_SELECT,
  toHourlyWage,
  toProperty,
  toReservationType,
  toSchedule,
  toSettings,
  toShift,
  toStay,
  toWorkSession,
} from '@/app/lib/api/mappers';
import { calcMonthlySalary, DEFAULT_SETTINGS } from '@/app/lib/domain/payroll';
import { addDays, monthRange, todayJst } from '@/app/lib/domain/datetime';
import { loadStayAmounts } from '@/app/lib/server/stay-amounts';
import type { DateRange } from '@/app/lib/domain/analytics';
import {
  addMonths,
  cleaningCountOf,
  cleaningDurationOf,
  cleaningsByStaff,
  guestStatsOf,
  revenueOf,
  weekdayOccupancy,
  laborInRange,
  monthAsRange,
  monthsBetween,
  monthsOfRange,
  occupancyOf,
  parseRange,
  perUnit,
  stayStatsOf,
} from '@/app/lib/domain/analytics';
import type { DailySalary } from '@/app/types/domain';
import { log } from '@/app/lib/api/logger';
import AnalyticsView from './AnalyticsView';
import type { AnalyticsData, Summary } from './types';

export const metadata = { title: '分析 | 民泊勤怠管理' };

export const dynamic = 'force-dynamic';

/** 過去何か月分を出すか（今月を含む） */
const PAST_MONTHS = 12;
/** 稼働率は予約が入っている先の月も見たいので、この月数だけ先まで出す */
const FUTURE_MONTHS = 2;

/** 1回の取得の上限。Supabase は既定で 1000 件までしか返さない */
const PAGE = 1000;

/**
 * 1000 件を超えても取りこぼさないよう、ページを分けて全部読む。
 * 12か月分の打刻や予定は件数が多くなりうるため。
 */
async function fetchAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>
): Promise<{ rows: T[]; error: { message: string; code?: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows, error: null };
  }
}

/**
 * 管理者向けの分析。
 *
 * 権限は guardAdminPage で確かめる。スタッフや未ログインの相手には
 * HTML そのものを返さない。読み取りは管理者本人の権限（RLS）で行う。
 */
async function loadAnalytics(
  requested: { from?: string; to?: string }
): Promise<AnalyticsData> {
  const { supabase } = await guardAdminPage('/admin/analytics');

  const today = todayJst();
  const currentMonth = today.slice(0, 7);
  const firstMonth = addMonths(currentMonth, -(PAST_MONTHS - 1));
  const lastMonth = addMonths(currentMonth, FUTURE_MONTHS);

  // 期間の指定（?from=2026-10-15&to=2026-11-15）。おかしな値は無視して月ごとの表示にする
  const range = parseRange(requested.from, requested.to);
  const rangeError =
    (requested.from || requested.to) && !range
      ? '期間の指定が正しくありません（開始日 ≦ 終了日、1年以内）'
      : null;

  // 月ごとの表示の範囲と、指定された期間の両方を読み込む
  const windowFrom = monthRange(firstMonth).from;
  const windowTo = monthRange(lastMonth).to;
  const from = range && range.from < windowFrom ? range.from : windowFrom;
  const to = range && range.to > windowTo ? range.to : windowTo;
  // 勤怠は今日より先には無い
  const laborTo = to < today ? to : today;

  const [propertiesRes, typesRes, usersRes, wagesRes, settingsRes, staysRes, schedulesRes, sessionsRes, shiftsRes] =
    await Promise.all([
      supabase.from('properties').select('*').eq('is_active', true).order('display_order'),
      supabase.from('reservation_types').select('*'),
      supabase.from('users').select('id, name, email').eq('role', 'staff').order('name'),
      supabase.from('hourly_wages').select('*').order('effective_from'),
      supabase.from('app_settings').select('*').eq('id', 1).single(),
      fetchAll((a, b) =>
        supabase
          .from('airbnb_stays')
          .select('id, property_id, kind, check_in, check_out, reservation_code, guest_count, note')
          .eq('status', 'active')
          .lte('check_in', to)
          .gt('check_out', from)
          .order('check_in')
          .range(a, b)
      ),
      fetchAll((a, b) =>
        supabase
          .from('reservations')
          .select('*')
          .eq('status', 'confirmed')
          .gte('schedule_date', from)
          .lte('schedule_date', to)
          .order('schedule_date')
          .range(a, b)
      ),
      fetchAll((a, b) =>
        supabase
          .from('work_sessions')
          .select(SESSION_SELECT)
          .gte('work_date', from)
          .lte('work_date', laborTo)
          .order('work_date')
          .range(a, b)
      ),
      // 清掃に実際にスタッフが入ったか（承諾したか）を見るため
      fetchAll((a, b) =>
        supabase
          .from('shifts')
          .select('*')
          .gte('shift_date', from)
          .lte('shift_date', to)
          .order('shift_date')
          .range(a, b)
      ),
    ]);

  // 取得に失敗した表は空として扱い、画面ごと落とさない。何が欠けたかは画面に出す
  const warnings: string[] = [];
  if (staysRes.error) {
    log.warn('analytics.stays_unavailable', { code: staysRes.error.code, message: staysRes.error.message });
    warnings.push('Airbnb の宿泊を読み込めませんでした。稼働率・泊数は表示されません。');
  }
  if (schedulesRes.error) {
    log.warn('analytics.schedules_unavailable', { code: schedulesRes.error.code, message: schedulesRes.error.message });
    warnings.push('予定を読み込めませんでした。清掃の回数は表示されません。');
  }
  if (shiftsRes.error) {
    log.warn('analytics.shifts_unavailable', { code: shiftsRes.error.code, message: shiftsRes.error.message });
    warnings.push('シフトを読み込めませんでした。清掃の回数は表示されません。');
  }
  if (sessionsRes.error) {
    log.warn('analytics.sessions_unavailable', { code: sessionsRes.error.code, message: sessionsRes.error.message });
    warnings.push('勤怠を読み込めませんでした。人件費は表示されません。');
  }

  const properties = (propertiesRes.data ?? []).map(toProperty);
  const types = (typesRes.data ?? []).map(toReservationType);
  const stays = staysRes.error ? [] : staysRes.rows.map(toStay);

  // 管理者が入れた金額。表（0031）が無ければ売上は出さない
  const { amounts, available: revenueAvailable } = await loadStayAmounts(supabase);
  for (const s of stays) s.amount = revenueAvailable ? (amounts.get(s.id) ?? null) : null;
  const schedules = schedulesRes.error ? [] : schedulesRes.rows.map(toSchedule);
  const sessions = sessionsRes.error ? [] : sessionsRes.rows.map(toWorkSession);
  const shifts = shiftsRes.error ? [] : shiftsRes.rows.map(toShift);
  const wages = (wagesRes.data ?? []).map(toHourlyWage);
  const settings = settingsRes.data ? toSettings(settingsRes.data) : DEFAULT_SETTINGS;
  const staff = usersRes.data ?? [];
  const now = new Date();

  const months = monthsBetween(firstMonth, lastMonth);

  // 宿泊の最初の日。これより前の月は「データ無し」と分かるようにする
  const firstStayDate = stays.length > 0 ? stays[0].checkIn : null;

  // 給与はスタッフ・月ごとに一度だけ計算し、期間で切り出して使う
  const salaryDays = new Map<string, DailySalary[]>();
  const daysOf = (userId: string, month: string): DailySalary[] => {
    const key = `${userId}|${month}`;
    const cached = salaryDays.get(key);
    if (cached) return cached;
    const result = calcMonthlySalary({
      month,
      sessions: sessions.filter((s) => s.userId === userId),
      wageHistory: wages.filter((w) => w.userId === userId),
      settings,
      now,
    }).days;
    salaryDays.set(key, result);
    return result;
  };

  /** 「ユーザー|日付」→ その日の実働。清掃にかかった時間の計算に使う */
  const workMsOf = (r: DateRange): Map<string, number> => {
    const map = new Map<string, number>();
    for (const u of staff) {
      for (const m of monthsOfRange(r)) {
        for (const d of daysOf(u.id as string, m)) {
          if (d.workDate >= r.from && d.workDate <= r.to) {
            map.set(`${u.id}|${d.workDate}`, d.actualWorkMs);
          }
        }
      }
    }
    return map;
  };

  /** 期間の集計。月ごとの表示も、指定した期間も同じ計算で出す */
  const summarize = (r: DateRange): Summary => {
    const isFuture = r.from > today;

    const perProperty = properties.map((p) => {
      const own = stays.filter((s) => s.propertyId === p.id);
      return {
        propertyId: p.id,
        occupancy: occupancyOf(own, r),
        stats: stayStatsOf(own, r),
        guests: guestStatsOf(own, p.capacity, r),
        revenue: revenueOf(own, r),
      };
    });
    const staffCleanings = cleaningsByStaff(schedules, types, shifts, r);

    // 人件費は給与計算と同じ関数で出す。給与集計の画面と金額が食い違わないように
    const laborByStaff = isFuture
      ? []
      : staff
          .map((u) => {
            const days = monthsOfRange(r).flatMap((m) => daysOf(u.id as string, m));
            const l = laborInRange(days, r);
            return {
              userId: u.id as string,
              name: ((u.name as string | null) || (u.email as string)) ?? 'スタッフ',
              amount: l.amount,
              workMs: l.workMs,
              days: l.days,
              // 時給が未設定の日は 0円で数えられる。人件費が少なく見えるので画面で知らせる
              missingWageDays: l.missingWageDays,
              cleanings: staffCleanings.get(u.id as string) ?? 0,
            };
          })
          .filter((row) => row.days > 0);

    const laborTotal = laborByStaff.reduce((sum, row) => sum + row.amount, 0);
    const cleanings = cleaningCountOf(schedules, types, shifts, r);

    const revenueTotal = perProperty.reduce((sum, p) => sum + p.revenue.revenue, 0);

    return {
      isFuture,
      perProperty,
      weekday: weekdayOccupancy(stays, properties.map((p) => p.id), r),
      cleaningDuration: isFuture
        ? null
        : cleaningDurationOf(schedules, types, shifts, workMsOf(r), r),
      revenueTotal,
      laborRatio:
        !isFuture && revenueAvailable && revenueTotal > 0 ? laborTotal / revenueTotal : null,
      laborTotal: isFuture ? null : laborTotal,
      laborByStaff,
      cleanings,
      laborPerCleaning: isFuture ? null : perUnit(laborTotal, cleanings),
    };
  };

  return {
    currentMonth,
    months,
    firstStayDate,
    warnings,
    properties: properties.map((p) => ({ id: p.id, name: p.name, color: p.color, capacity: p.capacity ?? null })),
    revenueAvailable,
    // 予約の先行き。選んだ月・期間に関係なく、今日から先を出す
    forward: [30, 60, 90].map((days) => {
      const r = { from: today, to: addDays(today, days - 1) };
      const perProperty = properties.map((p) => ({
        propertyId: p.id,
        occupancy: occupancyOf(stays.filter((s) => s.propertyId === p.id), r),
      }));
      const booked = perProperty.reduce((sum, p) => sum + p.occupancy.bookedNights, 0);
      const available = perProperty.reduce((sum, p) => sum + p.occupancy.availableNights, 0);
      return { days, ...r, perProperty, rate: available > 0 ? booked / available : null };
    }),
    byMonth: months.map((month) => ({ month, ...summarize(monthAsRange(month)) })),
    range: range ? { ...range, ...summarize(range) } : null,
    rangeError,
  };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const data = await loadAnalytics({ from: one(params.from), to: one(params.to) });

  return (
    <>
      <AppHeader title="分析" subtitle="稼働率・人件費（管理者のみ）" />
      <main className="max-w-4xl mx-auto px-4 py-5">
        <AnalyticsView data={data} />
      </main>
    </>
  );
}
