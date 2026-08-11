import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { toBreakRecord } from '@/app/lib/api/mappers';
import { isoDate, readBody, uuid } from '@/app/lib/api/validate';

// 休憩の追加（管理者による修正）
export const POST = withLogging('admin.breaks.post', async (request: Request) => {
  try {
    const { supabase } = await requireAdmin();
    const body = await readBody(request);

    const breakStart = isoDate(body.breakStart, '休憩開始');
    const breakEnd = body.breakEnd ? isoDate(body.breakEnd, '休憩終了') : null;

    if (breakEnd && breakEnd <= breakStart) {
      throw new ApiError(
        'VALIDATION_ERROR',
        '休憩終了は休憩開始より後にしてください'
      );
    }

    const { data, error } = await supabase
      .from('break_records')
      .insert({
        session_id: uuid(body.sessionId, 'セッション'),
        break_start: breakStart.toISOString(),
        break_end: breakEnd?.toISOString() ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ break: toBreakRecord(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
