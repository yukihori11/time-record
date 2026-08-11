import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { toReservationType } from '@/app/lib/api/mappers';
import { int, optionalStr, readBody, str, uuid } from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

export const PATCH = withLogging('reservation-types.id.patch', async (request: Request, { params }: Params) => {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;
    const body = await readBody(request);

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = str(body.name, '種別名', { max: 50 });
    if (body.color !== undefined) patch.color = str(body.color, '色', { max: 7 });
    if (body.icon !== undefined) {
      patch.icon = optionalStr(body.icon, 'アイコン', 8) ?? '';
    }
    if (body.hasGuests !== undefined) patch.has_guests = Boolean(body.hasGuests);
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);
    if (body.displayOrder !== undefined) {
      patch.display_order = int(body.displayOrder, '表示順', { min: 0, max: 999 });
    }

    const { data, error } = await supabase
      .from('reservation_types')
      .update(patch)
      .eq('id', uuid(id, 'id'))
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new ApiError('NOT_FOUND');

    return NextResponse.json({ type: toReservationType(data) });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withLogging('reservation-types.id.delete', async (_request: Request, { params }: Params) => {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;

    // 予約から参照されているため物理削除せず無効化する
    const { error } = await supabase
      .from('reservation_types')
      .update({ is_active: false })
      .eq('id', uuid(id, 'id'));

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
