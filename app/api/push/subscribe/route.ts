import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { readBody, str } from '@/app/lib/api/validate';
import { log } from '@/app/lib/api/logger';

/**
 * プッシュ通知の購読を登録する。
 *
 * 端末ごとに endpoint が異なるため、1人が複数登録できる。
 * 同じ端末から再登録された場合は上書きする。
 */
export const POST = withLogging('push.subscribe.post', async (request: Request) => {
  try {
    const { supabase, profile } = await requireUser();
    const body = await readBody(request);

    const subscription = body.subscription as
      | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      | undefined;

    const endpoint = str(subscription?.endpoint, '購読先', { max: 1000 });
    const p256dh = str(subscription?.keys?.p256dh, '鍵', { max: 500 });
    const auth = str(subscription?.keys?.auth, '認証情報', { max: 500 });

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: profile.id,
        endpoint,
        p256dh,
        auth,
        user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
        failed_count: 0,
        // 送信が拒否された印を消す。
        // 登録し直したということは、その端末はまた使える。
        failed_at: null,
      },
      { onConflict: 'endpoint' }
    );

    if (error) throw error;

    log.info('push.subscribed', {
      userId: profile.id,
      name: profile.name,
      userAgent: request.headers.get('user-agent')?.slice(0, 80),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** 購読を解除する */
export const DELETE = withLogging('push.subscribe.delete', async (request: Request) => {
  try {
    const { supabase, profile } = await requireUser();
    const body = await readBody(request);

    const endpoint = str(body.endpoint, '購読先', { max: 1000 });

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', profile.id)
      .eq('endpoint', endpoint);

    if (error) throw error;

    log.info('push.unsubscribed', { userId: profile.id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
