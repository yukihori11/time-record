import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { toStay } from '@/app/lib/api/mappers';
import { isMissingAmountTable } from '@/app/lib/server/stay-amounts';
import { int, optionalStr, readBody, uuid } from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

/**
 * Airbnb の宿泊に、iCal では取れない人数・メモ・金額を入れる。
 *
 * 金額は管理者だけが読める別の表（airbnb_stay_amounts）に入れる。
 * 宿泊の表はスタッフも読めるため。
 *
 * 日付・種別は同期で決まるので、ここでは変えさせない。
 * 宿泊者の名前は運用で使わないため持たない。
 */
export const PATCH = withLogging('stays.id.patch', async (request: Request, { params }: Params) => {
  try {
    const { supabase, profile } = await requireAdmin();
    const { id: rawId } = await params;
    const id = uuid(rawId, 'id');
    const body = await readBody(request);

    const patch: Record<string, unknown> = {};
    if (body.guestCount !== undefined) {
      patch.guest_count =
        body.guestCount === null || body.guestCount === ''
          ? null
          : int(body.guestCount, '人数', { min: 1, max: 100 });
    }
    if (body.note !== undefined) patch.note = optionalStr(body.note, 'メモ', 1000);

    // 金額。空欄なら削除（未入力に戻す）
    let amount: number | null | undefined;
    if (body.amount !== undefined) {
      amount =
        body.amount === null || body.amount === ''
          ? null
          : int(body.amount, '金額', { min: 0, max: 100_000_000 });
    }

    if (Object.keys(patch).length === 0 && amount === undefined) {
      throw new ApiError('VALIDATION_ERROR', '変更する項目がありません');
    }

    // 宿泊が存在するかを先に確かめる（金額だけの変更でも）
    const { data, error } =
      Object.keys(patch).length > 0
        ? await supabase.from('airbnb_stays').update(patch).eq('id', id).select().maybeSingle()
        : await supabase.from('airbnb_stays').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError('NOT_FOUND');

    const stay = toStay(data);

    if (amount !== undefined) {
      const { error: amountError } =
        amount === null
          ? await supabase.from('airbnb_stay_amounts').delete().eq('stay_id', id)
          : await supabase
              .from('airbnb_stay_amounts')
              .upsert({ stay_id: id, amount, updated_by: profile.id }, { onConflict: 'stay_id' });
      if (amountError) {
        if (isMissingAmountTable(amountError)) {
          throw new ApiError(
            'CONFLICT',
            '金額を保存する準備ができていません（マイグレーション 0031 の適用が必要です）。人数・メモは保存しました。'
          );
        }
        throw amountError;
      }
      stay.amount = amount;
    }

    return NextResponse.json({ stay });
  } catch (error) {
    return errorResponse(error);
  }
});
