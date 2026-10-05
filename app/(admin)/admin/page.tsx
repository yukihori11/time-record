import 'server-only';

import AppHeader from '@/app/components/layout/AppHeader';
import { guardAdminPage } from '@/app/lib/server/page-guard';
import {
  SESSION_SELECT,
  toHourlyWage,
  toProperty,
  toSchedule,
  toReservationType,
  toSettings,
  toShift,
  toStay,
  toWorkSession,
} from '@/app/lib/api/mappers';
import { calcMonthlySalary, DEFAULT_SETTINGS } from '@/app/lib/domain/payroll';
import { addDays, monthRange, todayJst } from '@/app/lib/domain/datetime';
import { checkInsOn } from '@/app/lib/domain/stays';
import { log } from '@/app/lib/api/logger';
import AdminDashboard from './AdminDashboard';

export const metadata = { title: '管理 | 民泊勤怠管理' };

export const dynamic = 'force-dynamic';

/**
 * 管理ダッシュボード。
 *
 * 全員分の勤怠と時給をまとめて取得し、集計はメモリ上で行う。
 * スタッフごとにクエリを投げるとN+1になるため。
 */
async function loadDashboard() {
  const { supabase } = await guardAdminPage('/admin');

  const today = todayJst();
  const tomorrow = addDays(today, 1);
  const month = today.slice(0, 7);
  const { from, to } = monthRange(month);

  const [
    usersRes,
    sessionsRes,
    wagesRes,
    settingsRes,
    reservationsRes,
    propertiesRes,
    typesRes,
    shiftsRes,
    staysRes,
    nearSchedulesRes,
    nearShiftsRes,
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, email')
      .eq('role', 'staff')
      .order('name'),
    supabase
      .from('work_sessions')
      .select(SESSION_SELECT)
      .gte('work_date', from)
      .lte('work_date', to),
    supabase.from('hourly_wages').select('*').order('effective_from'),
    supabase.from('app_settings').select('*').eq('id', 1).single(),
    supabase
      .from('reservations')
      .select('*')
      .eq('status', 'confirmed')
      .gte('schedule_date', from)
      .lte('schedule_date', to),
    supabase
      .from('properties')
      .select('*')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('reservation_types')
      .select('*')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('shifts')
      .select('*')
      .gte('shift_date', from)
      .lte('shift_date', to),

    // 今日・明日のチェックイン。入れ替えの判定に、同じ日に出る宿泊も要る
    supabase
      .from('airbnb_stays')
      .select('id, property_id, kind, check_in, check_out, reservation_code, guest_count, note')
      .eq('status', 'active')
      .eq('kind', 'reserved')
      .lte('check_in', tomorrow)
      .gte('check_out', today),

    // チェックイン当日の清掃の判定用。月末だと明日が翌月になるため
    // 月の範囲とは別に今日・明日の分を取る
    supabase
      .from('reservations')
      .select('*')
      .eq('status', 'confirmed')
      .gte('schedule_date', today)
      .lte('schedule_date', tomorrow),
    supabase
      .from('shifts')
      .select('*')
      .gte('shift_date', today)
      .lte('shift_date', tomorrow),
  ]);

  // migration 未適用の環境では表が無い。ホームごと落とさずチェックインなしで出す
  if (staysRes.error) {
    log.warn('dashboard.stays_unavailable', { code: staysRes.error.code, message: staysRes.error.message });
  }
  const stays = staysRes.error ? [] : (staysRes.data ?? []).map(toStay);
  const nearSchedules = (nearSchedulesRes.data ?? []).map(toSchedule);
  const nearShifts = (nearShiftsRes.data ?? []).map(toShift);
  const properties = (propertiesRes.data ?? []).map(toProperty);
  const types = (typesRes.data ?? []).map(toReservationType);
  const propertyOrder = properties.map((p) => p.id);

  const settings = settingsRes.data
    ? toSettings(settingsRes.data)
    : DEFAULT_SETTINGS;
  const allSessions = (sessionsRes.data ?? []).map(toWorkSession);
  const allWages = (wagesRes.data ?? []).map(toHourlyWage);
  const now = new Date();

  const salaries = (usersRes.data ?? [])
    .map((u) => {
      const sessions = allSessions.filter((s) => s.userId === u.id);
      if (sessions.length === 0) return null;

      return {
        user: { id: u.id, name: u.name ?? '', email: u.email },
        salary: calcMonthlySalary({
          month,
          sessions,
          wageHistory: allWages.filter((w) => w.userId === u.id),
          settings,
          now,
        }),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const twelveHoursAgo = Date.now() - 12 * 3600_000;

  return {
    salaries,
    grandTotal: salaries.reduce((sum, r) => sum + r.salary.totalAmount, 0),
    schedules: (reservationsRes.data ?? []).map(toSchedule),
    properties,
    types,
    checkIns: {
      today: { date: today, items: checkInsOn(today, stays, nearSchedules, types, nearShifts, propertyOrder) },
      tomorrow: { date: tomorrow, items: checkInsOn(tomorrow, stays, nearSchedules, types, nearShifts, propertyOrder) },
    },
    shifts: (shiftsRes.data ?? []).map(toShift),
    staleCount: allSessions.filter(
      (s) => s.clockOut === null && s.clockIn.getTime() < twelveHoursAgo
    ).length,
  };
}

export default async function AdminPage() {
  const today = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());

  const data = await loadDashboard();

  return (
    <>
      <AppHeader title="管理ホーム" subtitle={today} />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <AdminDashboard initialData={data} />
      </main>
    </>
  );
}
