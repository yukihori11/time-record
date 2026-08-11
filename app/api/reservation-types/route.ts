import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { toReservationType } from '@/app/lib/api/mappers';
import { int, optionalStr, readBody, str } from '@/app/lib/api/validate';

// 種別の一覧。カレンダー表示に必要なので全員が読める。
export const GET = withLogging('reservation-types.get', async (request: Request) => {
  try {
    const { supabase } = await requireUser();
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('all') === '1';

    let query = supabase
      .from('reservation_types')
      .select('*')
      .order('display_order');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ types: (data ?? []).map(toReservationType) });
  } catch (error) {
    return errorResponse(error);
  }
});

// 種別の追加は管理者のみ
export const POST = withLogging('reservation-types.post', async (request: Request) => {
  try {
    const { supabase } = await requireAdmin();
    const body = await readBody(request);

    const { data, error } = await supabase
      .from('reservation_types')
      .insert({
        name: str(body.name, '種別名', { max: 50 }),
        color: str(body.color ?? '#3b82f6', '色', { max: 7 }),
        icon: optionalStr(body.icon, 'アイコン', 8) ?? '',
        has_guests: body.hasGuests !== false,
        display_order: body.displayOrder
          ? int(body.displayOrder, '表示順', { min: 0, max: 999 })
          : 0,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ type: toReservationType(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
