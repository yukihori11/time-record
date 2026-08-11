import 'server-only';

import AppHeader from '@/app/components/layout/AppHeader';
import { requireAdmin } from '@/app/lib/api/auth';
import {
  SESSION_SELECT,
  toHourlyWage,
  toProperty,
  toReservation,
  toReservationType,
  toSettings,
  toShift,
  toWorkSession,
} from '@/app/lib/api/mappers';
import { calcMonthlySalary, DEFAULT_SETTINGS } from '@/app/lib/domain/payroll';
import { monthRange, todayJst } from '@/app/lib/domain/datetime';
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
  const { supabase } = await requireAdmin();

  const today = todayJst();
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
      .lte('check_in', to)
      .gte('check_out', from),
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
  ]);

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
    reservations: (reservationsRes.data ?? []).map(toReservation),
    properties: (propertiesRes.data ?? []).map(toProperty),
    types: (typesRes.data ?? []).map(toReservationType),
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
