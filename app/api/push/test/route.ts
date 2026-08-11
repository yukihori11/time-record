import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { notifyUser } from '@/app/lib/server/push';

/**
 * 自分にテスト通知を送る。
 *
 * 「有効にしたのに届かない」ときの切り分けに使う。
 * 送信先が0件なら、端末は購読済みでもサーバーに登録が
 * 無い状態だと分かる。
 */
export const POST = withLogging('push.test.post', async () => {
  try {
    const { supabase, profile } = await requireUser();

    const result = await notifyUser(
      supabase,
      profile.id,
      {
        title: 'テスト通知',
        body: '通知は正しく届いています',
        link: '/shifts',
        tag: 'test',
      },
      'other'
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
});
