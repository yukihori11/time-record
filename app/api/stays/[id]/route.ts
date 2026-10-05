import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { toStay } from '@/app/lib/api/mappers';
import { int, optionalStr, readBody, uuid } from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

/**
 * Airbnb の宿泊に、iCal では取れない人数・メモを入れる。
 *
 * 日付・種別は同期で決まるので、ここでは変えさせない。
 * 宿泊者の名前は運用で使わないため持たない。
 */
export const PATCH = withLogging('stays.id.patch', async (request: Request, { params }: Params) => {
  try {
    const { supabase } = await requireAdmin();
    const { id: rawId } = await params;
    const id = uuid(rawId, 'id');
    const body = await readBody(request);

    const patch: Record<string, unknown> = {};
    if (body.guestCount !== undefined) {
      patch.guest_count =
        body.guestCount === null || body.guestCount === ''
          ? null
          : int(body.guestCount, '人数', { min: 1, max: 100 });
    }
    if (body.note !== undefined) patch.note = optionalStr(body.note, 'メモ', 1000);

    if (Object.keys(patch).length === 0) {
      throw new ApiError('VALIDATION_ERROR', '変更する項目がありません');
    }

    const { data, error } = await supabase
      .from('airbnb_stays')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError('NOT_FOUND');

    return NextResponse.json({ stay: toStay(data) });
  } catch (error) {
    return errorResponse(error);
  }
});
