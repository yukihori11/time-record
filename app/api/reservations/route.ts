import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { toSchedule } from '@/app/lib/api/mappers';
import {
  dateStr,
  int,
  monthStr,
  optionalStr,
  optionalTime,
  optionalUuid,
  readBody,
  uuid,
} from '@/app/lib/api/validate';
import { monthRange } from '@/app/lib/domain/datetime';
import { notifyShiftAssignment } from '@/app/lib/server/shift-notify';
import { log } from '@/app/lib/api/logger';

/**
 * 予定の一覧。
 *
 * 予定は1日で完結するため、期間の重なりを考える必要がない。
 * 指定した範囲の日付を素直に引くだけで済む。
 */
export const GET = withLogging('reservations.get', async (request: Request) => {
  try {
    const { supabase } = await requireUser();
    const url = new URL(request.url);

    const monthParam = url.searchParams.get('month');
    let from: string;
    let to: string;

    if (monthParam) {
      const range = monthRange(monthStr(monthParam));
      from = range.from;
      to = range.to;
    } else {
      from = dateStr(url.searchParams.get('from'), 'from');
      to = dateStr(url.searchParams.get('to'), 'to');
    }

    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('status', 'confirmed')
      .gte('schedule_date', from)
      .lte('schedule_date', to)
      .order('schedule_date');

    if (error) throw error;

    return NextResponse.json({
      schedules: (data ?? []).map(toSchedule),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** 予定フォームから送られる担当者の指定を検証する */
function parseShifts(raw: unknown, scheduleDate: string) {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    return {
      // 予定は1日で完結するので、日付は予定日で固定する
      date: scheduleDate,
      userId: optionalUuid(o.userId, '担当者'),
      startTime: optionalTime(o.startTime, '入り時間'),
      endTime: optionalTime(o.endTime, '終了時間'),
      note: optionalStr(o.note, 'メモ', 500),
    };
  });
}

/**
 * 予定の登録。担当スタッフの割当も同時に行う。
 *
 * 予定だけ作られてシフトが失敗する状態を避けるため、
 * DB側の関数で単一トランザクションとして処理する。
 */
export const POST = withLogging('reservations.post', async (request: Request) => {
  try {
    const { supabase, profile } = await requireAdmin();
    const body = await readBody(request);

    const propertyId = uuid(body.propertyId, '棟');
    const scheduleDate = dateStr(body.scheduleDate, '日付');
    const shifts = parseShifts(body.shifts, scheduleDate);

    log.info('schedule.create', {
      creatorId: profile.id,
      propertyId,
      scheduleDate,
      assignedCount: shifts.filter((s) => s.userId).length,
    });

    const { data, error } = await supabase.rpc('create_schedule_with_shifts', {
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

    // 割り当てたスタッフに知らせる。
    // 通知が失敗しても予定の作成は取り消さない。
    const { data: property } = await supabase
      .from('properties')
      .select('name')
      .eq('id', propertyId)
      .maybeSingle();

    await notifyShiftAssignment(supabase, shifts, property?.name);

    return NextResponse.json({ schedule: toSchedule(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
