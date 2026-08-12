import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';

/**
 * この端末がサーバーに登録されているかを返す。
 *
 * 端末側の購読だけを見ていると、DBの登録が消えた場合に
 * 「受け取る」と表示されたまま通知が届かなくなる。
 *
 * 実際に起きた例:
 *   ユーザーを作り直すと ON DELETE CASCADE で購読も消える。
 *   端末は購読済みのままなので、本人は有効だと思い込む。
 */
export const GET = withLogging('push.status.get', async (request: Request) => {
  try {
    const { supabase, profile } = await requireUser();

    const url = new URL(request.url);
    const endpoint = url.searchParams.get('endpoint');

    if (!endpoint) {
      return NextResponse.json({ registered: false });
    }

    const { data } = await supabase
      .from('push_subscriptions')
      .select('id, failed_at')
      .eq('user_id', profile.id)
      .eq('endpoint', endpoint)
      .maybeSingle();

    // 送信が拒否された端末は、行が残っていても使えない。
    // 未登録として答え、その場で登録し直させる。
    //
    // failed_at は 0026 で追加した列。未適用の環境では
    // undefined になるので、その場合は従来どおり扱う。
    const failed = Boolean(
      (data as { failed_at?: string | null } | null)?.failed_at
    );

    return NextResponse.json({ registered: Boolean(data) && !failed });
  } catch (error) {
    return errorResponse(error);
  }
});
