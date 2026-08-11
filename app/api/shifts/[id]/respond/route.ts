import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { toShift } from '@/app/lib/api/mappers';
import { enumValue, optionalStr, readBody, uuid } from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

/**
 * シフトへの承諾・辞退。
 *
 * RPC 経由にすることで、本人以外は応答できず、
 * かつ日付や棟を書き換えられないようにしている。
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireUser();
    const { id } = await params;
    const body = await readBody(request);

    const response = enumValue(body.response, 'response', [
      'accepted',
      'declined',
    ] as const);

    const { data, error } = await supabase.rpc('respond_to_shift', {
      p_shift_id: uuid(id, 'id'),
      p_response: response,
      p_reason: optionalStr(body.reason, '理由', 500),
    });

    if (error) throw error;

    return NextResponse.json({ shift: toShift(data) });
  } catch (error) {
    return errorResponse(error);
  }
}
