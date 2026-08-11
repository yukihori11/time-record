import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { toBreakRecord } from '@/app/lib/api/mappers';
import { isoDate, readBody, uuid } from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

export const PATCH = withLogging('admin.breaks.id.patch', async (request: Request, { params }: Params) => {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;
    const body = await readBody(request);

    const patch: Record<string, unknown> = {};

    if (body.breakStart !== undefined) {
      patch.break_start = isoDate(body.breakStart, '休憩開始').toISOString();
    }
    if (body.breakEnd !== undefined) {
      patch.break_end = body.breakEnd
        ? isoDate(body.breakEnd, '休憩終了').toISOString()
        : null;
    }

    const { data, error } = await supabase
      .from('break_records')
      .update(patch)
      .eq('id', uuid(id, 'id'))
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new ApiError('NOT_FOUND');

    return NextResponse.json({ break: toBreakRecord(data) });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withLogging('admin.breaks.id.delete', async (request: Request, { params }: Params) => {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;

    const { error } = await supabase
      .from('break_records')
      .delete()
      .eq('id', uuid(id, 'id'));

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
