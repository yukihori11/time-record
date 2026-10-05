import 'server-only';

import { cache } from 'react';
import type {
  DayActual,
  MonthlySalary,
  Property,
  ReservationType,
  Schedule,
  Shift,
  Stay,
  UserProfile,
  WorkSession,
} from '@/app/types/domain';
import { requireUser } from '@/app/lib/api/auth';
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
import {
  calcDailySalary,
  calcMonthlySalary,
  DEFAULT_SETTINGS,
} from '@/app/lib/domain/payroll';
import { resolveWage } from '@/app/lib/domain/wage-history';
import { monthRange, todayJst } from '@/app/lib/domain/datetime';
import { scopeToStaff } from '@/app/lib/domain/stays';
import { log } from '@/app/lib/api/logger';

/**
 * Server Component から直接呼ぶデータ取得層。
 *
 * API を経由しないため HTTP の往復が発生せず、認証も
 * requireUser の cache() により1リクエストで1回に収まる。
 * 取得したデータは HTML に埋め込まれて届くので、
 * 画面が出た時点で内容が入っている。
 */

/** 打刻画面の初期データ */
export const getClockData = cache(async () => {
  const { supabase, profile } = await requireUser();

  const [sessionRes, propsRes, wagesRes, settingsRes] = await Promise.all([
    supabase
      .from('work_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', profile.id)
      .is('clock_out', null)
      .maybeSingle(),
    supabase
      .from('properties')
      .select('*')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('hourly_wages')
      .select('*')
      .eq('user_id', profile.id)
      .order('effective_from', { ascending: false }),
    supabase.from('app_settings').select('*').eq('id', 1).single(),
  ]);

  const wages = (wagesRes.data ?? []).map(toHourlyWage);
  const today = todayJst();
  const currentWage =
    wages.find((w) => w.effectiveFrom <= today)?.hourlyWage ?? null;

  return {
    session: sessionRes.data ? toWorkSession(sessionRes.data) : null,
    properties: (propsRes.data ?? []).map(toProperty),
    settings: settingsRes.data ? toSettings(settingsRes.data) : DEFAULT_SETTINGS,
    currentWage,
    serverNow: new Date().toISOString(),
  };
});

/** 給与画面の初期データ */
export const getSalaryData = cache(
  async (month: string): Promise<{ salary: MonthlySalary; settings: ReturnType<typeof toSettings> }> => {
    const { supabase, profile } = await requireUser();
    const { from, to } = monthRange(month);

    const [sessionsRes, wagesRes, settingsRes] = await Promise.all([
      supabase
        .from('work_sessions')
        .select(SESSION_SELECT)
        .eq('user_id', profile.id)
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date'),
      supabase
        .from('hourly_wages')
        .select('*')
        .eq('user_id', profile.id)
        .order('effective_from'),
      supabase.from('app_settings').select('*').eq('id', 1).single(),
    ]);

    const settings = settingsRes.data
      ? toSettings(settingsRes.data)
      : DEFAULT_SETTINGS;

    return {
      salary: calcMonthlySalary({
        month,
        sessions: (sessionsRes.data ?? []).map(toWorkSession),
        wageHistory: (wagesRes.data ?? []).map(toHourlyWage),
        settings,
        now: new Date(),
      }),
      settings,
    };
  }
);

/** カレンダー画面の初期データ */
export const getCalendarData = cache(async (month: string) => {
  const { supabase, profile } = await requireUser();
  const { from, to } = monthRange(month);

  const isAdmin = profile.role === 'admin';

  const [
    reservationsRes,
    propertiesRes,
    shiftsRes,
    usersRes,
    typesRes,
    sessionsRes,
    wagesRes,
    settingsRes,
    staysRes,
  ] = await Promise.all([
      supabase
        .from('reservations')
        .select('*')
        .eq('status', 'confirmed')
        .gte('schedule_date', from)
        .lte('schedule_date', to)
        .order('schedule_date'),
      supabase
        .from('properties')
        .select('*')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', from)
        .lte('shift_date', to)
        .order('shift_date'),
      supabase.rpc('list_staff_names'),
      supabase
        .from('reservation_types')
        .select('*')
        .eq('is_active', true)
        .order('display_order'),

      // 実績の稼働時間を出すための勤怠。
      // 管理者は全員分、スタッフは自分の分だけ（RLSが絞る）。
      supabase
        .from('work_sessions')
        .select(SESSION_SELECT)
        .gte('work_date', from)
        .lte('work_date', to),

      // 金額の計算に使う。スタッフは自分の時給しか見えない。
      supabase.from('hourly_wages').select('*').order('effective_from'),
      supabase.from('app_settings').select('*').eq('id', 1).single(),

      // Airbnb の宿泊。月に少しでも掛かるもの（前月から続く・翌月へ続く分も含む）
      supabase
        .from('airbnb_stays')
        .select('id, property_id, kind, check_in, check_out, reservation_code, guest_count, note')
        .eq('status', 'active')
        .lte('check_in', to)
        .gte('check_out', from)
        .order('check_in'),
    ]);

  // migration 未適用の環境では表が無い。カレンダーごと落とさず宿泊なしで出す
  if (staysRes.error) {
    log.warn('calendar.stays_unavailable', { code: staysRes.error.code, message: staysRes.error.message });
  }
  const stayRows = staysRes.error ? [] : (staysRes.data ?? []);

  const allShifts = (shiftsRes.data ?? []).map(toShift) as Shift[];
  const allSchedules = (reservationsRes.data ?? []).map(toSchedule) as Schedule[];
  const allStays: Stay[] = stayRows.map(toStay);

  // スタッフには、自分にお願いされた分だけを返す。
  //   シフト  自分のもの
  //   予定    自分のシフトが紐づくもの
  //   宿泊    自分のシフトがある日・棟にチェックインするもの（清掃は当日のため）
  // 予定・シフトの RLS は全員に読めるので、ここで絞らないと
  // 他のスタッフの担当や名前が届いてしまう。
  const { shifts, schedules, stays } = isAdmin
    ? { shifts: allShifts, schedules: allSchedules, stays: allStays }
    : scopeToStaff(profile.id, allShifts, allSchedules, allStays);

  const settings = settingsRes.data
    ? toSettings(settingsRes.data)
    : DEFAULT_SETTINGS;

  const sessions = (sessionsRes.data ?? []).map(toWorkSession);
  const wages = (wagesRes.data ?? []).map(toHourlyWage);

  // 日付ごと・ユーザーごとに実績をまとめる。
  // カレンダーの各日で「誰が何時間働いて、いくらか」を出すため。
  const now = new Date();
  const actuals: Record<string, DayActual[]> = {};

  const byDateUser = new Map<string, WorkSession[]>();
  for (const s of sessions) {
    const key = `${s.workDate}|${s.userId}`;
    const list = byDateUser.get(key);
    if (list) list.push(s);
    else byDateUser.set(key, [s]);
  }

  for (const [key, list] of byDateUser) {
    const [workDate, userId] = key.split('|');
    const wage = resolveWage(
      wages.filter((w) => w.userId === userId),
      workDate
    );

    const daily = calcDailySalary({
      workDate,
      sessions: list,
      hourlyWage: wage,
      settings,
      now,
    });

    const entry: DayActual = {
      userId,
      actualWorkMs: daily.actualWorkMs,
      breakMs: daily.breakMs,
      billedMinutes: daily.billedMinutes,
      amount: daily.amount,
      hourlyWage: wage,
      isWorking: list.some((s) => s.clockOut === null),
      isGuaranteeApplied: daily.isGuaranteeApplied,
    };

    if (actuals[workDate]) actuals[workDate].push(entry);
    else actuals[workDate] = [entry];
  }

  // 当月の合計。管理者は全員分、スタッフは自分の分。
  const monthlyTotal = Object.values(actuals)
    .flat()
    .reduce(
      (acc, a) => ({
        workMs: acc.workMs + a.actualWorkMs,
        amount: acc.amount + a.amount,
        days: acc.days,
      }),
      { workMs: 0, amount: 0, days: Object.keys(actuals).length }
    );

  return {
    schedules,
    properties: (propertiesRes.data ?? []).map(toProperty) as Property[],
    shifts,
    types: (typesRes.data ?? []).map(toReservationType) as ReservationType[],
    stays,
    // スタッフには自分の名前だけ。他のスタッフの名前は使わないので渡さない
    users: ((usersRes.data ?? []) as { id: string; name: string }[])
      .filter((u) => isAdmin || u.id === profile.id)
      .map(
      (u): UserProfile => ({
        id: u.id,
        email: '',
        name: u.name ?? '',
        role: 'staff',
        isActive: true,
      })
    ),
    actuals,
    monthlyTotal,
    currentUserId: profile.id,
    isAdmin,
  };
});

/** 自分のシフト一覧 */
export const getMyShifts = cache(async (month: string) => {
  const { supabase, profile } = await requireUser();
  const { from, to } = monthRange(month);

  const [shiftsRes, propsRes] = await Promise.all([
    supabase
      .from('shifts')
      .select('*')
      .eq('user_id', profile.id)
      .gte('shift_date', from)
      .lte('shift_date', to)
      .order('shift_date'),
    supabase
      .from('properties')
      .select('*')
      .eq('is_active', true)
      .order('display_order'),
  ]);

  return {
    shifts: (shiftsRes.data ?? []).map(toShift) as Shift[],
    properties: (propsRes.data ?? []).map(toProperty) as Property[],
  };
});

/**
 * WorkSession は Date を含むため、Server Component から
 * Client Component へ渡す際に文字列へ変換する。
 * Next.js のシリアライズは Date を通すが、型の一貫性のため明示する。
 */
export function serializeSession(session: WorkSession | null) {
  if (!session) return null;
  return {
    ...session,
    clockIn: session.clockIn.toISOString(),
    clockOut: session.clockOut?.toISOString() ?? null,
    editedAt: session.editedAt?.toISOString() ?? null,
    breaks: session.breaks.map((b) => ({
      id: b.id,
      sessionId: b.sessionId,
      breakStart: b.breakStart.toISOString(),
      breakEnd: b.breakEnd?.toISOString() ?? null,
    })),
  };
}
