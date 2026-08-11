import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MonthlySalary } from '@/app/types/domain';
import { calcMonthlySalary } from '@/app/lib/domain/payroll';
import { SESSION_SELECT, toHourlyWage, toSettings, toWorkSession } from './mappers';
import { monthRange } from '@/app/lib/domain/datetime';
import { DEFAULT_SETTINGS } from '@/app/lib/domain/payroll';

/**
 * 指定ユーザーの月次給与を計算する。
 *
 * 給与額は保存せず毎回計算する。こうすることで
 * 時給の遡り修正・勤怠の後修正・丸め設定の変更が
 * 常に整合した結果になる。
 */
export async function computeMonthlySalary(
  supabase: SupabaseClient,
  userId: string,
  month: string
): Promise<MonthlySalary> {
  const { from, to } = monthRange(month);

  const [sessionsRes, wagesRes, settingsRes] = await Promise.all([
    supabase
      .from('work_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', userId)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date'),
    supabase
      .from('hourly_wages')
      .select('*')
      .eq('user_id', userId)
      .order('effective_from'),
    supabase.from('app_settings').select('*').eq('id', 1).single(),
  ]);

  if (sessionsRes.error) throw sessionsRes.error;

  return calcMonthlySalary({
    month,
    sessions: (sessionsRes.data ?? []).map(toWorkSession),
    wageHistory: (wagesRes.data ?? []).map(toHourlyWage),
    settings: settingsRes.data ? toSettings(settingsRes.data) : DEFAULT_SETTINGS,
    now: new Date(),
  });
}
