import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/app/lib/api/logger';

/**
 * 宿泊ごとの金額（airbnb_stay_amounts）の読み書き。管理者だけが使う。
 *
 * 表はマイグレーション 0031 で作る。未適用の環境でも画面が壊れないよう、
 * 表が無いときは「金額なし」として扱い、available: false を返す。
 */

/** 表が無い（マイグレーション未適用）ときのエラーか */
export function isMissingAmountTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' || // PostgreSQL: relation does not exist
    error.code === 'PGRST205' || // PostgREST: テーブルがスキーマのキャッシュに無い
    (error.message ?? '').includes('airbnb_stay_amounts')
  );
}

/** .in() に一度に渡す件数。URL が長くなりすぎないように分ける */
const CHUNK = 200;

/**
 * 金額を読む。stayIds を渡せばその分だけ、省けば全件。
 * 読めなかったときは空の Map と available: false を返す。
 */
export async function loadStayAmounts(
  supabase: SupabaseClient,
  stayIds?: string[]
): Promise<{ amounts: Map<string, number>; available: boolean }> {
  const amounts = new Map<string, number>();

  const readRows = async (ids?: string[]) => {
    const rows: { stay_id: string; amount: number }[] = [];
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('airbnb_stay_amounts').select('stay_id, amount');
      if (ids) q = q.in('stay_id', ids);
      const { data, error } = await q.order('stay_id').range(from, from + 999);
      if (error) return { rows, error };
      rows.push(...((data ?? []) as { stay_id: string; amount: number }[]));
      if (!data || data.length < 1000) return { rows, error: null };
    }
  };

  const batches = stayIds ? chunk(stayIds, CHUNK) : [undefined];
  for (const ids of batches) {
    if (ids && ids.length === 0) continue;
    const { rows, error } = await readRows(ids);
    if (error) {
      if (!isMissingAmountTable(error)) {
        log.warn('stay_amounts.read_failed', { code: error.code, message: error.message });
      }
      return { amounts: new Map(), available: false };
    }
    for (const r of rows) amounts.set(r.stay_id, r.amount);
  }

  return { amounts, available: true };
}

function chunk<T>(list: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += size) result.push(list.slice(i, i + size));
  return result;
}
