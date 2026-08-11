import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { toProperty } from '@/app/lib/api/mappers';
import { int, optionalStr, readBody, str, uuid } from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;
    const body = await readBody(request);

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = str(body.name, '棟名', { max: 100 });
    if (body.address !== undefined) patch.address = optionalStr(body.address, '住所', 300);
    if (body.capacity !== undefined) {
      patch.capacity = body.capacity ? int(body.capacity, '定員', { min: 1, max: 100 }) : null;
    }
    if (body.color !== undefined) patch.color = str(body.color, '色', { max: 7 });
    if (body.note !== undefined) patch.note = optionalStr(body.note, 'メモ', 1000);
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);
    if (body.displayOrder !== undefined) {
      patch.display_order = int(body.displayOrder, '表示順', { min: 0, max: 999 });
    }

    const { data, error } = await supabase
      .from('properties')
      .update(patch)
      .eq('id', uuid(id, 'id'))
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new ApiError('NOT_FOUND');

    return NextResponse.json({ property: toProperty(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;

    // 予約や勤怠が紐づくため物理削除せず無効化する
    const { error } = await supabase
      .from('properties')
      .update({ is_active: false })
      .eq('id', uuid(id, 'id'));

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
