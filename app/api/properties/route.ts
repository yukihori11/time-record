import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { toProperty } from '@/app/lib/api/mappers';
import { int, optionalStr, readBody, str } from '@/app/lib/api/validate';

// 棟の一覧。バイト生もカレンダー表示に必要なので閲覧可。
export const GET = withLogging('properties.get', async (request: Request) => {
  try {
    const { supabase } = await requireUser();
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('all') === '1';

    let query = supabase.from('properties').select('*').order('display_order');
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      properties: (data ?? []).map(toProperty),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// 棟の追加は管理者のみ
export const POST = withLogging('properties.post', async (request: Request) => {
  try {
    const { supabase } = await requireAdmin();
    const body = await readBody(request);

    const { data, error } = await supabase
      .from('properties')
      .insert({
        name: str(body.name, '棟名', { max: 100 }),
        address: optionalStr(body.address, '住所', 300),
        capacity: body.capacity ? int(body.capacity, '定員', { min: 1, max: 100 }) : null,
        color: str(body.color ?? '#3b82f6', '色', { max: 7 }),
        note: optionalStr(body.note, 'メモ', 1000),
        display_order: body.displayOrder
          ? int(body.displayOrder, '表示順', { min: 0, max: 999 })
          : 0,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ property: toProperty(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
