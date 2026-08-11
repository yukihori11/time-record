import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { monthStr } from '@/app/lib/api/validate';
import {
  SESSION_SELECT,
  toHourlyWage,
  toSettings,
  toWorkSession,
} from '@/app/lib/api/mappers';
import { calcMonthlySalary, DEFAULT_SETTINGS } from '@/app/lib/domain/payroll';
import { monthRange, todayJst } from '@/app/lib/domain/datetime';

/**
 * 全スタッフの月次給与。
 *
 * 以前はスタッフごとに3クエリ発行していた（10人で30クエリ）。
 * 全員分をまとめて取得し、集計はメモリ上で行う。
 * DBへの問い合わせは人数によらず4回。
 */
export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const url = new URL(request.url);

    const month = monthStr(
      url.searchParams.get('month') ?? todayJst().slice(0, 7)
    );
    const format = url.searchParams.get('format');
    const { from, to } = monthRange(month);

    // 給与の対象はバイト生のみ（管理者は時給を持たない）。
    // 無効化した人も含める。月の途中で退職した場合に
    // 未払い分が消えてしまうため。
    const [usersRes, sessionsRes, wagesRes, settingsRes] = await Promise.all([
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
    ]);

    if (usersRes.error) throw usersRes.error;
    if (sessionsRes.error) throw sessionsRes.error;

    const settings = settingsRes.data
      ? toSettings(settingsRes.data)
      : DEFAULT_SETTINGS;
    const allSessions = (sessionsRes.data ?? []).map(toWorkSession);
    const allWages = (wagesRes.data ?? []).map(toHourlyWage);
    const now = new Date();

    const results = (usersRes.data ?? [])
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

    if (format === 'csv') {
      const rows = [
        ['氏名', 'メール', '勤務日数', '実労働時間', '支給額'],
        ...results.map((r) => [
          r.user.name,
          r.user.email,
          String(r.salary.days.length),
          (r.salary.totalWorkMs / 3600_000).toFixed(2),
          String(r.salary.totalAmount),
        ]),
      ];

      const csv = rows
        .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
        .join('\n');

      // Excel が UTF-8 と認識できるよう BOM を付ける
      return new NextResponse(`﻿${csv}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="salary-${month}.csv"`,
        },
      });
    }

    return NextResponse.json({
      month,
      results,
      grandTotal: results.reduce((sum, r) => sum + r.salary.totalAmount, 0),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
