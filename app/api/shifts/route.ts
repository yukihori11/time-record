import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { toShift } from '@/app/lib/api/mappers';
import {
  dateStr,
  monthStr,
  optionalStr,
  optionalTime,
  optionalUuid,
  readBody,
  uuid,
} from '@/app/lib/api/validate';
import { monthRange } from '@/app/lib/domain/datetime';

/**
 * シフト一覧。
 *
 * スタッフには自分のシフトだけを返す（他のスタッフの担当は見せない方針）。
 * RLS の SELECT は全許可のままなので、ここで必ず絞る。
 * 管理者は userId で絞り込める。
 */
export const GET = withLogging('shifts.get', async (request: Request) => {
  try {
    const { supabase, profile } = await requireUser();
    const url = new URL(request.url);

    const monthParam = url.searchParams.get('month');
    const requestedUserId = url.searchParams.get('userId');
    // スタッフは指定にかかわらず自分だけ
    const userId = profile.role === 'admin' ? requestedUserId : profile.id;

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

    let query = supabase
      .from('shifts')
      .select('*')
      .gte('shift_date', from)
      .lte('shift_date', to)
      .order('shift_date')
      .order('start_time', { nullsFirst: true });

    if (userId) {
      query = query.eq('user_id', uuid(userId, 'userId'));
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ shifts: (data ?? []).map(toShift) });
  } catch (error) {
    return errorResponse(error);
  }
});

// シフトの割当は管理者のみ。複数日をまとめて登録できる。
export const POST = withLogging('shifts.post', async (request: Request) => {
  try {
    const { supabase, profile } = await requireAdmin();
    const body = await readBody(request);

    const userId = uuid(body.userId, 'スタッフ');
    const propertyId = optionalUuid(body.propertyId, '棟');
    const startTime = optionalTime(body.startTime, '開始時刻');
    const endTime = optionalTime(body.endTime, '終了時刻');
    const note = optionalStr(body.note, 'メモ', 500);

    const rawDates = Array.isArray(body.dates) ? body.dates : [body.shiftDate];
    const dates = rawDates.map((d: unknown) => dateStr(d, '日付'));

    const rows = dates.map((shiftDate: string) => ({
      user_id: userId,
      property_id: propertyId,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      note,
      assigned_by: profile.id,
      status: 'assigned',
    }));

    const { data, error } = await supabase
      .from('shifts')
      .insert(rows)
      .select();

    if (error) throw error;

    return NextResponse.json(
      { shifts: (data ?? []).map(toShift) },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
});
