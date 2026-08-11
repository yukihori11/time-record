import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { SESSION_SELECT, toProperty, toWorkSession } from '@/app/lib/api/mappers';

/**
 * 打刻状態の復元。
 *
 * 画面を開くたびにここを叩いて DB から状態を取り直す。
 * localStorage を使わないので、スマホでタブが破棄されても、
 * 別の端末で開いても、必ず正しい状態が復元される。
 *
 * serverNow を返すのは、端末の時計がズレていても
 * 経過時間の表示が狂わないようにするため。
 */
export const GET = withLogging('clock.status.get', async () => {
  try {
    const { supabase, profile } = await requireUser();

    const [sessionRes, propsRes] = await Promise.all([
      supabase
        .from('work_sessions')
        .select(SESSION_SELECT)
        .eq('user_id', profile.id)
        .is('clock_out', null)
        .maybeSingle(),
      supabase
        .from('properties')
        .select('*')
        .eq('is_active', true)
        .order('display_order'),
    ]);

    if (sessionRes.error) throw sessionRes.error;

    return NextResponse.json({
      session: sessionRes.data ? toWorkSession(sessionRes.data) : null,
      properties: (propsRes.data ?? []).map(toProperty),
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
