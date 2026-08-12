import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
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
import { log } from '@/app/lib/api/logger';
import {
  notifyStaffOfShiftChange,
  notifyStaffOfShiftRemoval,
} from '@/app/lib/server/shift-change-notify';

const SHIFT_SNAPSHOT =
  'user_id, shift_date, start_time, end_time, property_id, status, note';

interface SnapshotRow {
  user_id: string;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  property_id: string | null;
  status: string;
  note: string | null;
}

function toSnapshot(row: SnapshotRow) {
  return {
    userId: row.user_id,
    shiftDate: row.shift_date,
    startTime: row.start_time,
    endTime: row.end_time,
    propertyId: row.property_id,
    status: row.status,
    note: row.note,
  };
}

type Params = { params: Promise<{ id: string }> };

// 管理者によるシフトの変更
export const PATCH = withLogging('shifts.id.patch', async (request: Request, { params }: Params) => {
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

    // 変更前を控える。本人に「何がどう変わったか」を
    // 伝えるため。日付や時刻の変更に気づかないと
    // 来る日を間違える。
    const { data: beforeRow } = await supabase
      .from('shifts')
      .select(SHIFT_SNAPSHOT)
      .eq('id', uuid(id, 'id'))
      .maybeSingle();

    const { data, error } = await supabase
      .from('shifts')
      .update(patch)
      .eq('id', uuid(id, 'id'))
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new ApiError('NOT_FOUND');

    const shift = toShift(data);

    if (beforeRow) {
      const before = toSnapshot(beforeRow as unknown as SnapshotRow);

      log.info('shift.changed', {
        shiftId: uuid(id, 'id'),
        userId: before.userId,
        fields: Object.keys(patch),
      });

      // 通知の失敗で変更を巻き戻さない
      await notifyStaffOfShiftChange(supabase, before, {
        userId: before.userId,
        shiftDate: shift.shiftDate,
        startTime: shift.startTime,
        endTime: shift.endTime,
        propertyId: shift.propertyId,
        status: shift.status,
        note: shift.note ?? null,
      });
    }

    return NextResponse.json({ shift });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withLogging('shifts.id.delete', async (request: Request, { params }: Params) => {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;

    // 消す前に控える。承諾済みだった場合は特に重要で、
    // 伝わらないと当日その場に現れることになる。
    const { data: beforeRow } = await supabase
      .from('shifts')
      .select(SHIFT_SNAPSHOT)
      .eq('id', uuid(id, 'id'))
      .maybeSingle();

    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', uuid(id, 'id'));

    if (error) throw error;

    if (beforeRow) {
      const removed = toSnapshot(beforeRow as unknown as SnapshotRow);
      log.info('shift.removed', {
        shiftId: uuid(id, 'id'),
        userId: removed.userId,
        status: removed.status,
      });
      await notifyStaffOfShiftRemoval(supabase, removed);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
