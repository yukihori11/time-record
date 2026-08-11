import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { computeMonthlySalary } from '@/app/lib/api/salary';
import { monthStr } from '@/app/lib/api/validate';
import { todayJst } from '@/app/lib/domain/datetime';

/**
 * 全スタッフの月次給与。
 *
 * CSV でも出せるようにしておく（給与振込の作業用）。
 */
export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const url = new URL(request.url);

    const month = monthStr(
      url.searchParams.get('month') ?? todayJst().slice(0, 7)
    );
    const format = url.searchParams.get('format');

    // 無効化したスタッフも含める。
    // 月の途中で退職した人の未払い分が消えてしまうため、
    // is_active では絞らない。
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email')
      .order('name');

    if (error) throw error;

    const results = await Promise.all(
      (users ?? []).map(async (u) => ({
        user: { id: u.id, name: u.name ?? '', email: u.email },
        salary: await computeMonthlySalary(supabase, u.id, month),
      }))
    );

    // 勤務実績がある人だけ
    const withWork = results.filter((r) => r.salary.days.length > 0);

    if (format === 'csv') {
      const rows = [
        ['氏名', 'メール', '勤務日数', '実労働時間', '支給額'],
        ...withWork.map((r) => [
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
      results: withWork,
      grandTotal: withWork.reduce((sum, r) => sum + r.salary.totalAmount, 0),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
