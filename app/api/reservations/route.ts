import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { toReservation } from '@/app/lib/api/mappers';
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

/**
 * 予約一覧。
 *
 * 月を指定すると、その月に期間が重なる予約を返す。
 * 前月末チェックイン・当月チェックアウトの予約も拾う必要があるため、
 * 単純な期間一致ではなく重なり判定で引く。
 */
export async function GET(request: Request) {
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
      .lte('check_in', to)
      .gte('check_out', from)
      .order('check_in');

    if (error) throw error;

    return NextResponse.json({
      reservations: (data ?? []).map(toReservation),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** 予約フォームから送られる1日分のシフト指定を検証する */
function parseShifts(raw: unknown): {
  date: string;
  userId: string | null;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}[] {
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
 * 予約の登録。シフトの割当も同時に行う。
 *
 * 予約だけ作られてシフトが失敗する状態を避けるため、
 * DB側の関数で単一トランザクションとして処理する。
 */
export async function POST(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const body = await readBody(request);

    const checkIn = dateStr(body.checkIn, '開始日');
    const checkOut = dateStr(body.checkOut, '終了日');

    if (checkOut < checkIn) {
      throw new ApiError(
        'VALIDATION_ERROR',
        '終了日は開始日以降にしてください'
      );
    }

    const { data, error } = await supabase.rpc(
      'create_reservation_with_shifts',
      {
        p_property_id: uuid(body.propertyId, '棟'),
        p_type_id: uuid(body.typeId, '種別'),
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_guest_count:
          body.guestCount === undefined || body.guestCount === null
            ? 0
            : int(body.guestCount, '人数', { min: 0, max: 100 }),
        p_note: optionalStr(body.note, 'メモ', 2000),
        p_shifts: parseShifts(body.shifts),
      }
    );

    if (error) throw error;

    return NextResponse.json(
      { reservation: toReservation(data) },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
