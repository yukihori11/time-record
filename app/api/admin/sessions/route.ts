import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { SESSION_SELECT, toWorkSession } from '@/app/lib/api/mappers';
import {
  dateStr,
  isoDate,
  optionalStr,
  optionalUuid,
  readBody,
  str,
  uuid,
} from '@/app/lib/api/validate';

/**
 * 勤怠一覧。
 *
 * 12時間以上経っても退勤していないセッションを
 * 「押し忘れの疑い」として一緒に返す。
 */
export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const url = new URL(request.url);

    const from = dateStr(url.searchParams.get('from'), 'from');
    const to = dateStr(url.searchParams.get('to'), 'to');
    const userId = url.searchParams.get('userId');

    let query = supabase
      .from('work_sessions')
      .select(SESSION_SELECT)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date', { ascending: false })
      .order('clock_in', { ascending: false });

    if (userId) {
      query = query.eq('user_id', uuid(userId, 'userId'));
    }

    const { data, error } = await query;
    if (error) throw error;

    const sessions = (data ?? []).map(toWorkSession);
    const twelveHoursAgo = Date.now() - 12 * 3600_000;

    return NextResponse.json({
      sessions,
      staleSessions: sessions
        .filter(
          (s) => s.clockOut === null && s.clockIn.getTime() < twelveHoursAgo
        )
        .map((s) => s.id),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * 打刻の遡り登録（押し忘れ対応）。
 *
 * 手動で作ったことが分かるよう is_manually_edited を立て、
 * 誰がなぜ作ったかを記録する。
 */
export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireAdmin();
    const body = await readBody(request);

    const clockIn = isoDate(body.clockIn, '出勤時刻');
    const clockOut = body.clockOut ? isoDate(body.clockOut, '退勤時刻') : null;

    if (clockOut && clockOut <= clockIn) {
      throw new ApiError('VALIDATION_ERROR', '退勤時刻は出勤時刻より後にしてください');
    }

    const { data, error } = await supabase
      .from('work_sessions')
      .insert({
        user_id: uuid(body.userId, 'スタッフ'),
        property_id: optionalUuid(body.propertyId, '棟'),
        clock_in: clockIn.toISOString(),
        clock_out: clockOut?.toISOString() ?? null,
        status: clockOut ? 'completed' : 'working',
        note: optionalStr(body.note, 'メモ', 500),
        is_manually_edited: true,
        edited_by: profile.id,
        edited_at: new Date().toISOString(),
        edit_reason: str(body.editReason, '修正理由', { max: 500 }),
      })
      .select(SESSION_SELECT)
      .single();

    if (error) throw error;

    return NextResponse.json({ session: toWorkSession(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
