import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { toHourlyWage } from '@/app/lib/api/mappers';
import { log } from '@/app/lib/api/logger';
import {
  dateStr,
  int,
  optionalStr,
  readBody,
  uuid,
} from '@/app/lib/api/validate';

// 時給履歴の取得
export const GET = withLogging('admin.wages.get', async (request: Request) => {
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
});

// 新しい時給を追加（適用開始日つき）
export const POST = withLogging('admin.wages.post', async (request: Request) => {
  try {
    const { supabase, profile } = await requireAdmin();
    const body = await readBody(request);

    const userId = uuid(body.userId, 'スタッフ');
    const wage = int(body.hourlyWage, '時給', { min: 1, max: 99999 });
    const from = dateStr(body.effectiveFrom, '適用開始日');

    log.info('wage.set', {
      editorId: profile.id,
      targetUserId: userId,
      hourlyWage: wage,
      effectiveFrom: from,
    });

    const { data, error } = await supabase
      .from('hourly_wages')
      .insert({
        user_id: userId,
        hourly_wage: wage,
        effective_from: from,
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
});
