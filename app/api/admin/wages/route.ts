import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { toHourlyWage } from '@/app/lib/api/mappers';
import {
  dateStr,
  int,
  optionalStr,
  readBody,
  uuid,
} from '@/app/lib/api/validate';

// 時給履歴の取得
export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    let query = supabase
      .from('hourly_wages')
      .select('*')
      .order('effective_from', { ascending: false });

    if (userId) {
      query = query.eq('user_id', uuid(userId, 'userId'));
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ wages: (data ?? []).map(toHourlyWage) });
  } catch (error) {
    return errorResponse(error);
  }
}

// 新しい時給を追加（適用開始日つき）
export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireAdmin();
    const body = await readBody(request);

    const { data, error } = await supabase
      .from('hourly_wages')
      .insert({
        user_id: uuid(body.userId, 'スタッフ'),
        hourly_wage: int(body.hourlyWage, '時給', { min: 1, max: 99999 }),
        effective_from: dateStr(body.effectiveFrom, '適用開始日'),
        note: optionalStr(body.note, 'メモ', 500),
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ wage: toHourlyWage(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
