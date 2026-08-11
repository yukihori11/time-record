import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import {
  SESSION_SELECT,
  toHourlyWage,
  toProperty,
  toSchedule,
  toSettings,
  toWorkSession,
} from '@/app/lib/api/mappers';
import { calcMonthlySalary, DEFAULT_SETTINGS } from '@/app/lib/domain/payroll';
import { monthRange, todayJst } from '@/app/lib/domain/datetime';

/**
 * 管理ダッシュボードのデータを1回で返す。
 *
 * 以前はスタッフ1人ごとに給与計算のクエリを3本ずつ投げていたため、
 * 10人いれば30クエリになっていた。
 * 全員分の勤怠と時給をまとめて取り、集計はメモリ上で行う。
 */
export const GET = withLogging('admin.dashboard.get', async () => {
  try {
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
    ] = await Promise.all([
      supabase.from('users').select('id, name, email').order('name'),
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
    ]);

    if (sessionsRes.error) throw sessionsRes.error;

    const settings = settingsRes.data
      ? toSettings(settingsRes.data)
      : DEFAULT_SETTINGS;
    const allSessions = (sessionsRes.data ?? []).map(toWorkSession);
    const allWages = (wagesRes.data ?? []).map(toHourlyWage);
    const now = new Date();

    // ユーザーごとに配分してから集計する（DBへの追加問い合わせなし）
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

    // 12時間以上経っても退勤されていない勤務
    const twelveHoursAgo = Date.now() - 12 * 3600_000;
    const staleSessions = allSessions.filter(
      (s) => s.clockOut === null && s.clockIn.getTime() < twelveHoursAgo
    );

    return NextResponse.json({
      salaries,
      grandTotal: salaries.reduce((sum, r) => sum + r.salary.totalAmount, 0),
      schedules: (reservationsRes.data ?? []).map(toSchedule),
      properties: (propertiesRes.data ?? []).map(toProperty),
      staleCount: staleSessions.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
