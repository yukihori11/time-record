import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { toSettings } from '@/app/lib/api/mappers';
import { enumValue, int, readBody } from '@/app/lib/api/validate';

// 給与ルール（丸め方向・単位・最低保証）
export async function GET() {
  try {
    const { supabase } = await requireAdmin();

    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) throw error;

    return NextResponse.json({ settings: toSettings(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, profile } = await requireAdmin();
    const body = await readBody(request);

    const patch: Record<string, unknown> = { updated_by: profile.id };

    if (body.roundingMode !== undefined) {
      patch.rounding_mode = enumValue(body.roundingMode, '丸め方向', [
        'up',
        'down',
      ] as const);
    }
    if (body.roundingMinutes !== undefined) {
      const minutes = int(body.roundingMinutes, '丸め単位', { min: 1, max: 60 });
      if (![1, 5, 10, 15, 30, 60].includes(minutes)) {
        throw new ApiError(
          'VALIDATION_ERROR',
          '丸め単位は 1/5/10/15/30/60 分のいずれかです'
        );
      }
      patch.rounding_minutes = minutes;
    }
    if (body.minGuaranteedMinutes !== undefined) {
      patch.min_guaranteed_minutes = int(body.minGuaranteedMinutes, '最低保証', {
        min: 0,
        max: 1440,
      });
    }

    const { data, error } = await supabase
      .from('app_settings')
      .update(patch)
      .eq('id', 1)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ settings: toSettings(data) });
  } catch (error) {
    return errorResponse(error);
  }
}
