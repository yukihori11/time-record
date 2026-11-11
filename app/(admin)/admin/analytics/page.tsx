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
  toStay,
  toWorkSession,
} from '@/app/lib/api/mappers';
import { calcMonthlySalary, DEFAULT_SETTINGS } from '@/app/lib/domain/payroll';
import { monthRange, todayJst } from '@/app/lib/domain/datetime';
import {
  addMonths,
  cleaningCountOf,
  monthsBetween,
  occupancyOf,
  perUnit,
  stayStatsOf,
} from '@/app/lib/domain/analytics';
import { log } from '@/app/lib/api/logger';
import AnalyticsView from './AnalyticsView';
import type { AnalyticsData } from './types';

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
async function loadAnalytics(): Promise<AnalyticsData> {
  const { supabase } = await guardAdminPage('/admin/analytics');

  const currentMonth = todayJst().slice(0, 7);
  const firstMonth = addMonths(currentMonth, -(PAST_MONTHS - 1));
  const lastMonth = addMonths(currentMonth, FUTURE_MONTHS);
  const from = monthRange(firstMonth).from;
  const to = monthRange(lastMonth).to;
  const laborTo = monthRange(currentMonth).to;

  const [propertiesRes, typesRes, usersRes, wagesRes, settingsRes, staysRes, schedulesRes, sessionsRes] =
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
  if (sessionsRes.error) {
    log.warn('analytics.sessions_unavailable', { code: sessionsRes.error.code, message: sessionsRes.error.message });
    warnings.push('勤怠を読み込めませんでした。人件費は表示されません。');
  }

  const properties = (propertiesRes.data ?? []).map(toProperty);
  const types = (typesRes.data ?? []).map(toReservationType);
  const stays = staysRes.error ? [] : staysRes.rows.map(toStay);
  const schedules = schedulesRes.error ? [] : schedulesRes.rows.map(toSchedule);
  const sessions = sessionsRes.error ? [] : sessionsRes.rows.map(toWorkSession);
  const wages = (wagesRes.data ?? []).map(toHourlyWage);
  const settings = settingsRes.data ? toSettings(settingsRes.data) : DEFAULT_SETTINGS;
  const staff = usersRes.data ?? [];
  const now = new Date();

  const months = monthsBetween(firstMonth, lastMonth);

  // 宿泊の最初の日。これより前の月は「データ無し」と分かるようにする
  const firstStayDate = stays.length > 0 ? stays[0].checkIn : null;

  return {
    currentMonth,
    months,
    firstStayMonth: firstStayDate ? firstStayDate.slice(0, 7) : null,
    warnings,
    properties: properties.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    byMonth: months.map((month) => {
      const isFuture = month > currentMonth;

      const perProperty = properties.map((p) => {
        const own = stays.filter((s) => s.propertyId === p.id);
        return {
          propertyId: p.id,
          occupancy: occupancyOf(own, month),
          stats: stayStatsOf(own, month),
        };
      });

      // 人件費は給与計算と同じ関数で出す。給与集計の画面と金額が食い違わないように
      const laborByStaff = isFuture
        ? []
        : staff
            .map((u) => {
              const own = sessions.filter((s) => s.userId === u.id);
              const salary = calcMonthlySalary({
                month,
                sessions: own,
                wageHistory: wages.filter((w) => w.userId === u.id),
                settings,
                now,
              });
              return {
                userId: u.id as string,
                name: ((u.name as string | null) || (u.email as string)) ?? 'スタッフ',
                amount: salary.totalAmount,
                workMs: salary.totalWorkMs,
                days: salary.days.length,
                // 時給が未設定の日は 0円で数えられる。人件費が少なく見えるので画面で知らせる
                missingWageDays: salary.missingWageDates.length,
              };
            })
            .filter((r) => r.days > 0);

      const laborTotal = laborByStaff.reduce((sum, r) => sum + r.amount, 0);
      const cleanings = cleaningCountOf(schedules, types, month);

      return {
        month,
        isFuture,
        perProperty,
        laborTotal: isFuture ? null : laborTotal,
        laborByStaff,
        cleanings,
        laborPerCleaning: isFuture ? null : perUnit(laborTotal, cleanings),
      };
    }),
  };
}

export default async function AnalyticsPage() {
  const data = await loadAnalytics();

  return (
    <>
      <AppHeader title="分析" subtitle="稼働率・人件費（管理者のみ）" />
      <main className="max-w-4xl mx-auto px-4 py-5">
        <AnalyticsView data={data} />
      </main>
    </>
  );
}
