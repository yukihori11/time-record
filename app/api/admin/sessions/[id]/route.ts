import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { SESSION_SELECT, toWorkSession } from '@/app/lib/api/mappers';
import {
  enumValue,
  isoDate,
  optionalStr,
  optionalUuid,
  readBody,
  str,
  uuid,
} from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

/**
 * 勤怠の後修正。
 *
 * 修正理由を必須にして、監査ログに何が起きたかを残す。
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, profile } = await requireAdmin();
    const { id } = await params;
    const sessionId = uuid(id, 'id');
    const body = await readBody(request);

    // 既存の値を先に読む。
    // 片方の時刻だけ更新した場合でも、変更後の姿で整合を検査するため。
    const { data: existing } = await supabase
      .from('work_sessions')
      .select('clock_in, clock_out')
      .eq('id', sessionId)
      .maybeSingle();

    if (!existing) throw new ApiError('NOT_FOUND');

    const patch: Record<string, unknown> = {
      is_manually_edited: true,
      edited_by: profile.id,
      edited_at: new Date().toISOString(),
      edit_reason: str(body.editReason, '修正理由', { max: 500 }),
    };

    // 更新後の値（指定がなければ既存値のまま）
    let nextClockIn = new Date(existing.clock_in);
    let nextClockOut = existing.clock_out ? new Date(existing.clock_out) : null;

    if (body.clockIn !== undefined) {
      nextClockIn = isoDate(body.clockIn, '出勤時刻');
      patch.clock_in = nextClockIn.toISOString();
    }

    if (body.clockOut !== undefined) {
      nextClockOut = body.clockOut ? isoDate(body.clockOut, '退勤時刻') : null;
      patch.clock_out = nextClockOut?.toISOString() ?? null;
      // 退勤を入れたら完了、消したら勤務中に戻す
      patch.status = nextClockOut ? 'completed' : 'working';
    }

    // 変更後の姿で検査する。DB の CHECK 制約に頼ると
    // 「入力値が制約に違反しています」としか出ず原因が分からない。
    if (nextClockOut) {
      if (nextClockOut <= nextClockIn) {
        throw new ApiError(
          'VALIDATION_ERROR',
          '退勤時刻は出勤時刻より後にしてください'
        );
      }

      const hours =
        (nextClockOut.getTime() - nextClockIn.getTime()) / 3_600_000;
      if (hours >= 24) {
        throw new ApiError(
          'VALIDATION_ERROR',
          '勤務時間が24時間を超えています。時刻を確認してください'
        );
      }
    }

    if (body.status !== undefined) {
      const status = enumValue(body.status, 'status', [
        'working',
        'on_break',
        'completed',
        'cancelled',
      ] as const);

      // status と退勤時刻の組み合わせが破綻しないようにする
      const needsClockOut = status === 'completed' || status === 'cancelled';
      if (needsClockOut && !nextClockOut) {
        throw new ApiError(
          'VALIDATION_ERROR',
          `${status === 'completed' ? '完了' : '取消'}にするには退勤時刻が必要です`
        );
      }
      if (!needsClockOut && nextClockOut) {
        throw new ApiError(
          'VALIDATION_ERROR',
          '勤務中にするには退勤時刻を空にしてください'
        );
      }

      patch.status = status;
    }

    if (body.propertyId !== undefined) {
      patch.property_id = optionalUuid(body.propertyId, '棟');
    }
    if (body.note !== undefined) {
      patch.note = optionalStr(body.note, 'メモ', 500);
    }

    const { data, error } = await supabase
      .from('work_sessions')
      .update(patch)
      .eq('id', sessionId)
      .select(SESSION_SELECT)
      .single();

    if (error) throw error;
    if (!data) throw new ApiError('NOT_FOUND');

    return NextResponse.json({ session: toWorkSession(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;

    const { error } = await supabase
      .from('work_sessions')
      .delete()
      .eq('id', uuid(id, 'id'));

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
