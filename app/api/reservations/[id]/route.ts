import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { toReservation, toShift } from '@/app/lib/api/mappers';
import { notifyShiftAssignment } from '@/app/lib/server/shift-notify';
import {
  dateStr,
  int,
  optionalStr,
  optionalTime,
  optionalUuid,
  readBody,
  uuid,
} from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

/** 予約の詳細（紐づくシフトも含む） */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { supabase } = await requireUser();
    const { id } = await params;
    const reservationId = uuid(id, 'id');

    const [resRes, shiftsRes] = await Promise.all([
      supabase
        .from('reservations')
        .select('*')
        .eq('id', reservationId)
        .maybeSingle(),
      supabase
        .from('shifts')
        .select('*')
        .eq('reservation_id', reservationId)
        .order('shift_date'),
    ]);

    if (!resRes.data) throw new ApiError('NOT_FOUND');

    return NextResponse.json({
      reservation: toReservation(resRes.data),
      shifts: (shiftsRes.data ?? []).map(toShift),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function parseShifts(raw: unknown) {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    return {
      date: dateStr(o.date, '日付'),
      userId: optionalUuid(o.userId, '担当者'),
      startTime: optionalTime(o.startTime, '入り時間'),
      endTime: optionalTime(o.endTime, '終了時間'),
      note: optionalStr(o.note, 'メモ', 500),
    };
  });
}

/**
 * 予約の更新。シフトも入れ替える。
 *
 * 既に承諾済みのシフトは、同じ担当者・同じ日であれば
 * 回答状況を引き継ぐ（時刻だけ直したときに承諾が消えないように）。
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;
    const reservationId = uuid(id, 'id');
    const body = await readBody(request);

    const checkIn = dateStr(body.checkIn, '開始日');
    const checkOut = dateStr(body.checkOut, '終了日');

    if (checkOut < checkIn) {
      throw new ApiError(
        'VALIDATION_ERROR',
        '終了日は開始日以降にしてください'
      );
    }

    const propertyId = uuid(body.propertyId, '棟');
    const shifts = parseShifts(body.shifts);

    // 変更前の割当を控えておき、新しく追加された分だけ通知する。
    // 時刻を直しただけの人に再通知すると鬱陶しいため。
    const { data: before } = await supabase
      .from('shifts')
      .select('user_id, shift_date')
      .eq('reservation_id', reservationId);

    const existing = new Set(
      (before ?? []).map((s) => `${s.user_id}:${s.shift_date}`)
    );

    const { data, error } = await supabase.rpc(
      'update_reservation_with_shifts',
      {
        p_reservation_id: reservationId,
        p_property_id: propertyId,
        p_type_id: uuid(body.typeId, '種別'),
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_guest_count:
          body.guestCount === undefined || body.guestCount === null
            ? 0
            : int(body.guestCount, '人数', { min: 0, max: 100 }),
        p_note: optionalStr(body.note, 'メモ', 2000),
        p_shifts: shifts,
      }
    );

    if (error) throw error;

    const added = shifts.filter(
      (s) => s.userId && !existing.has(`${s.userId}:${s.date}`)
    );

    if (added.length > 0) {
      const { data: property } = await supabase
        .from('properties')
        .select('name')
        .eq('id', propertyId)
        .maybeSingle();

      await notifyShiftAssignment(supabase, added, property?.name);
    }

    return NextResponse.json({ reservation: toReservation(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;

    // 紐づくシフトは ON DELETE CASCADE で一緒に消える
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
