import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { toShift } from '@/app/lib/api/mappers';
import { enumValue, optionalStr, readBody, uuid } from '@/app/lib/api/validate';
import { log } from '@/app/lib/api/logger';
import { notifyAdminsOfShiftResponse } from '@/app/lib/server/admin-notify';

type Params = { params: Promise<{ id: string }> };

/**
 * シフトへの承諾・辞退。
 *
 * RPC 経由にすることで、本人以外は応答できず、
 * かつ日付や棟を書き換えられないようにしている。
 */
export const POST = withLogging('shifts.id.respond.post', async (request: Request, { params }: Params) => {
  try {
    const { supabase, profile } = await requireUser();
    const { id } = await params;
    const body = await readBody(request);

    const response = enumValue(body.response, 'response', [
      'accepted',
      'declined',
    ] as const);

    // 変更前の状態を控える。
    // 初回の回答か、一度出した答えを変えたのかで
    // 管理者への通知の文面を変えるため。
    //
    // 0027 が未適用なら null が返る。その場合は
    // 従来どおり初回として扱う。
    const { data: before } = await supabase.rpc('my_shift_status', {
      p_shift_id: uuid(id, 'id'),
    });
    const previous = typeof before === 'string' ? before : null;
    const isChange = previous === 'accepted' || previous === 'declined';

    // 誰がいつ承諾・辞退したか。管理者への報告や
    // 「言った言わない」の確認に使う。
    log.info('shift.respond', {
      userId: profile.id,
      name: profile.name,
      shiftId: uuid(id, 'id'),
      response,
      previous,
      isChange,
    });

    const { data, error } = await supabase.rpc('respond_to_shift', {
      p_shift_id: uuid(id, 'id'),
      p_response: response,
      p_reason: optionalStr(body.reason, '理由', 500),
    });

    if (error) throw error;

    const shift = toShift(data);

    // 管理者に知らせる。特に辞退は代わりを探す必要があるため、
    // 早く気づけることが重要。通知の失敗で回答は取り消さない。
    const { data: property } = shift.propertyId
      ? await supabase
          .from('properties')
          .select('name')
          .eq('id', shift.propertyId)
          .maybeSingle()
      : { data: null };

    await notifyAdminsOfShiftResponse(supabase, {
      staffName: profile.name || profile.email,
      response,
      shiftDate: shift.shiftDate,
      propertyName: property?.name ?? null,
      startTime: shift.startTime,
      reason: shift.declineReason ?? null,
      isChange,
    });

    return NextResponse.json({ shift });
  } catch (error) {
    return errorResponse(error);
  }
});
