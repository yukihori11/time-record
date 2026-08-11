import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { toReservation } from '@/app/lib/api/mappers';
import {
  dateStr,
  int,
  optionalStr,
  optionalTime,
  readBody,
  uuid,
} from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;
    const reservationId = uuid(id, 'id');
    const body = await readBody(request);

    // 片方の日付だけ更新した場合も整合を検査できるよう既存値を読む
    const { data: existing } = await supabase
      .from('reservations')
      .select('check_in, check_out')
      .eq('id', reservationId)
      .maybeSingle();

    if (!existing) throw new ApiError('NOT_FOUND');

    const patch: Record<string, unknown> = {};

    if (body.propertyId !== undefined) patch.property_id = uuid(body.propertyId, '棟');
    if (body.guestName !== undefined) {
      patch.guest_name = optionalStr(body.guestName, '予約者名', 100) ?? '';
    }
    if (body.guestCount !== undefined) {
      patch.guest_count = int(body.guestCount, '人数', { min: 1, max: 100 });
    }
    if (body.checkIn !== undefined) patch.check_in = dateStr(body.checkIn, 'チェックイン日');
    if (body.checkOut !== undefined) patch.check_out = dateStr(body.checkOut, 'チェックアウト日');
    if (body.checkInTime !== undefined) {
      patch.check_in_time = optionalTime(body.checkInTime, 'チェックイン時刻');
    }
    if (body.checkOutTime !== undefined) {
      patch.check_out_time = optionalTime(body.checkOutTime, 'チェックアウト時刻');
    }
    if (body.source !== undefined) patch.source = optionalStr(body.source, '予約元', 50);
    if (body.contact !== undefined) patch.contact = optionalStr(body.contact, '連絡先', 200);
    if (body.note !== undefined) patch.note = optionalStr(body.note, 'メモ', 2000);
    if (body.status !== undefined) {
      patch.status = body.status === 'cancelled' ? 'cancelled' : 'confirmed';
    }

    // 変更後の姿で検査する
    const nextCheckIn = (patch.check_in as string) ?? existing.check_in;
    const nextCheckOut = (patch.check_out as string) ?? existing.check_out;

    if (nextCheckOut <= nextCheckIn) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'チェックアウト日はチェックイン日より後にしてください'
      );
    }

    const { data, error } = await supabase
      .from('reservations')
      .update(patch)
      .eq('id', reservationId)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new ApiError('NOT_FOUND');

    return NextResponse.json({ reservation: toReservation(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;

    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', uuid(id, 'id'));

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
