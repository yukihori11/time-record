import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { SESSION_SELECT, toWorkSession } from '@/app/lib/api/mappers';
import { enumValue, optionalUuid, readBody } from '@/app/lib/api/validate';

const ACTIONS = ['clock_in', 'clock_out', 'break_start', 'break_end'] as const;

/**
 * 打刻。押した瞬間に DB へ書き込む。
 *
 * 実際の更新は Postgres の関数（RPC）が行う。理由は2つ:
 *   1. 複数テーブルの更新を単一トランザクションにするため
 *      （退勤時に進行中の休憩も同時に閉じる、など）
 *   2. 時刻をサーバーの now() にするため。端末の時計を信用しない
 *
 * 二重打刻は DB の部分ユニークインデックスが弾く。
 * アプリ側のチェックが漏れても、連打や複数端末でも破綻しない。
 */
export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    const body = await readBody(request);
    const action = enumValue(body.action, 'action', ACTIONS);

    if (action === 'clock_in') {
      const propertyId = optionalUuid(body.propertyId, 'propertyId');
      const { error } = await supabase.rpc('clock_in', {
        p_property_id: propertyId,
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.rpc(action);
      if (error) throw error;
    }

    // 打刻後の状態をそのまま返し、クライアントが再取得せずに済むようにする
    const { data, error: fetchError } = await supabase
      .from('work_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', profile.id)
      .is('clock_out', null)
      .maybeSingle();

    if (fetchError) throw fetchError;

    return NextResponse.json({
      session: data ? toWorkSession(data) : null,
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
