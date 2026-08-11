import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { computeMonthlySalary } from '@/app/lib/api/salary';
import { monthStr } from '@/app/lib/api/validate';
import { toSettings } from '@/app/lib/api/mappers';
import { todayJst } from '@/app/lib/domain/datetime';
import { DEFAULT_SETTINGS } from '@/app/lib/domain/payroll';

// 自分の月次給与
export async function GET(request: Request) {
  try {
    const { supabase, profile } = await requireUser();

    const url = new URL(request.url);
    const month = monthStr(
      url.searchParams.get('month') ?? todayJst().slice(0, 7)
    );

    const [salary, settingsRes] = await Promise.all([
      computeMonthlySalary(supabase, profile.id, month),
      supabase.from('app_settings').select('*').eq('id', 1).single(),
    ]);

    return NextResponse.json({
      salary,
      settings: settingsRes.data ? toSettings(settingsRes.data) : DEFAULT_SETTINGS,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
