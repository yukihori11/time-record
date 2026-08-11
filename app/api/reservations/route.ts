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
  readBody,
  uuid,
} from '@/app/lib/api/validate';
import { monthRange } from '@/app/lib/domain/datetime';

/**
 * 予約一覧。
 *
 * 月を指定すると、その月に「滞在が重なる」予約を返す。
 * 前月末チェックイン・当月チェックアウトの予約も含める必要があるため、
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

    // check_in <= 期間末 かつ check_out > 期間頭 で重なりを判定
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('status', 'confirmed')
      .lte('check_in', to)
      .gt('check_out', from)
      .order('check_in');

    if (error) throw error;

    return NextResponse.json({
      reservations: (data ?? []).map(toReservation),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// 予約の登録は管理者のみ（手動入力）
export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireAdmin();
    const body = await readBody(request);

    const checkIn = dateStr(body.checkIn, 'チェックイン日');
    const checkOut = dateStr(body.checkOut, 'チェックアウト日');

    if (checkOut <= checkIn) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'チェックアウト日はチェックイン日より後にしてください'
      );
    }

    const { data, error } = await supabase
      .from('reservations')
      .insert({
        property_id: uuid(body.propertyId, '棟'),
        guest_name: optionalStr(body.guestName, '予約者名', 100) ?? '',
        guest_count: int(body.guestCount, '人数', { min: 1, max: 100 }),
        check_in: checkIn,
        check_out: checkOut,
        check_in_time: optionalTime(body.checkInTime, 'チェックイン時刻'),
        check_out_time: optionalTime(body.checkOutTime, 'チェックアウト時刻'),
        source: optionalStr(body.source, '予約元', 50),
        contact: optionalStr(body.contact, '連絡先', 200),
        note: optionalStr(body.note, 'メモ', 2000),
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ reservation: toReservation(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
