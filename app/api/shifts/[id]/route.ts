import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { toShift } from '@/app/lib/api/mappers';
import {
  dateStr,
  enumValue,
  optionalStr,
  optionalTime,
  optionalUuid,
  readBody,
  uuid,
} from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

// 管理者によるシフトの変更
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;
    const body = await readBody(request);

    const patch: Record<string, unknown> = {};

    if (body.propertyId !== undefined) {
      patch.property_id = optionalUuid(body.propertyId, '棟');
    }
    if (body.shiftDate !== undefined) {
      patch.shift_date = dateStr(body.shiftDate, '日付');
    }
    if (body.startTime !== undefined) {
      patch.start_time = optionalTime(body.startTime, '開始時刻');
    }
    if (body.endTime !== undefined) {
      patch.end_time = optionalTime(body.endTime, '終了時刻');
    }
    if (body.note !== undefined) patch.note = optionalStr(body.note, 'メモ', 500);
    if (body.status !== undefined) {
      const status = enumValue(body.status, 'status', [
        'assigned',
        'accepted',
        'declined',
      ] as const);
      patch.status = status;

      // 未回答に戻すときは、前回の回答の痕跡も消す。
      // 残っていると「未回答なのに辞退理由がある」状態になる。
      if (status === 'assigned') {
        patch.responded_at = null;
        patch.decline_reason = null;
      }
    }

    const { data, error } = await supabase
      .from('shifts')
      .update(patch)
      .eq('id', uuid(id, 'id'))
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new ApiError('NOT_FOUND');

    return NextResponse.json({ shift: toShift(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;

    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', uuid(id, 'id'));

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
