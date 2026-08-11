import 'server-only';

import { cache } from 'react';
import type {
  MonthlySalary,
  Property,
  Reservation,
  ReservationType,
  Shift,
  UserProfile,
  WorkSession,
} from '@/app/types/domain';
import { requireUser } from '@/app/lib/api/auth';
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

  const [reservationsRes, propertiesRes, shiftsRes, usersRes, typesRes] =
    await Promise.all([
      supabase
        .from('reservations')
        .select('*')
        .eq('status', 'confirmed')
        .lte('check_in', to)
        .gte('check_out', from)
        .order('check_in'),
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
    ]);

  return {
    reservations: (reservationsRes.data ?? []).map(toReservation) as Reservation[],
    properties: (propertiesRes.data ?? []).map(toProperty) as Property[],
    shifts: (shiftsRes.data ?? []).map(toShift) as Shift[],
    types: (typesRes.data ?? []).map(toReservationType) as ReservationType[],
    users: ((usersRes.data ?? []) as { id: string; name: string }[]).map(
      (u): UserProfile => ({
        id: u.id,
        email: '',
        name: u.name ?? '',
        role: 'staff',
        isActive: true,
      })
    ),
    currentUserId: profile.id,
    isAdmin: profile.role === 'admin',
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
