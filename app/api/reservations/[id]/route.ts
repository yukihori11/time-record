import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { toSchedule, toShift } from '@/app/lib/api/mappers';
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

/** 予定の詳細（担当スタッフも含む） */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { supabase } = await requireUser();
    const { id } = await params;
    const scheduleId = uuid(id, 'id');

    const [scheduleRes, shiftsRes] = await Promise.all([
      supabase
        .from('reservations')
        .select('*')
        .eq('id', scheduleId)
        .maybeSingle(),
      supabase
        .from('shifts')
        .select('*')
        .eq('reservation_id', scheduleId)
        .order('start_time', { nullsFirst: true }),
    ]);

    if (!scheduleRes.data) throw new ApiError('NOT_FOUND');

    return NextResponse.json({
      schedule: toSchedule(scheduleRes.data),
      shifts: (shiftsRes.data ?? []).map(toShift),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function parseShifts(raw: unknown, scheduleDate: string) {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    return {
      date: scheduleDate,
      userId: optionalUuid(o.userId, '担当者'),
      startTime: optionalTime(o.startTime, '入り時間'),
      endTime: optionalTime(o.endTime, '終了時間'),
      note: optionalStr(o.note, 'メモ', 500),
    };
  });
}

/**
 * 予定の更新。担当スタッフも入れ替える。
 *
 * 既に承諾済みの人は、引き続き担当なら回答状況を引き継ぐ。
 * 時刻だけ直したときに承諾が消えないようにするため。
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;
    const scheduleId = uuid(id, 'id');
    const body = await readBody(request);

    const propertyId = uuid(body.propertyId, '棟');
    const scheduleDate = dateStr(body.scheduleDate, '日付');
    const shifts = parseShifts(body.shifts, scheduleDate);

    // 変更前の担当者を控え、新しく追加された人だけに通知する
    const { data: before } = await supabase
      .from('shifts')
      .select('user_id')
      .eq('reservation_id', scheduleId);

    const existing = new Set((before ?? []).map((s) => s.user_id));

    const { data, error } = await supabase.rpc('update_schedule_with_shifts', {
      p_reservation_id: scheduleId,
      p_property_id: propertyId,
      p_type_id: uuid(body.typeId, '種別'),
      p_schedule_date: scheduleDate,
      p_guest_count:
        body.guestCount === undefined || body.guestCount === null
          ? 0
          : int(body.guestCount, '人数', { min: 0, max: 100 }),
      p_note: optionalStr(body.note, 'メモ', 2000),
      p_shifts: shifts,
    });

    if (error) throw error;

    const added = shifts.filter((s) => s.userId && !existing.has(s.userId));

    if (added.length > 0) {
      const { data: property } = await supabase
        .from('properties')
        .select('name')
        .eq('id', propertyId)
        .maybeSingle();

      await notifyShiftAssignment(supabase, added, property?.name);
    }

    return NextResponse.json({ schedule: toSchedule(data) });
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
