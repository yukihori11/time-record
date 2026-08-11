import 'server-only';

import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/app/lib/api/logger';

/**
 * プッシュ通知の送信。
 *
 * 通知は「届けば嬉しい」もので、失敗しても本体の処理
 * （シフトの割当など）を止めてはいけない。
 * そのためこのモジュールは例外を投げず、結果を返すだけにする。
 */

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  link?: string;
  tag?: string;
}

/**
 * 指定ユーザーに通知を送る。
 *
 * あわせて notifications テーブルにも記録する。
 * 通知を許可していない端末や、通知を消してしまった場合でも
 * アプリを開けば確認できるようにするため。
 */
export async function notifyUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
  kind: 'shift' | 'shift_cancelled' | 'reminder' | 'other' = 'shift'
): Promise<{ sent: number; failed: number }> {
  // まず記録を残す。プッシュが失敗してもこちらは残る。
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      title: payload.title,
      body: payload.body,
      link: payload.link ?? null,
      kind,
    });
  } catch (error) {
    log.error('push.recordFailed', { userId, error: String(error) });
  }

  if (!ensureConfigured()) {
    log.warn('push.notConfigured', {
      userId,
      message: 'VAPID キーが未設定のため通知を送れません',
    });
    return { sent: 0, failed: 0 };
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subs || subs.length === 0) {
    // 端末を登録していない人。通知は届かないが記録は残っている。
    log.info('push.noSubscription', { userId, title: payload.title });
    return { sent: 0, failed: 0 };
  }

  const message = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          message
        );
        sent++;
      } catch (error) {
        failed++;
        const status = (error as { statusCode?: number }).statusCode;

        // 404/410 は購読が無効になった印。消してよい。
        if (status === 404 || status === 410) {
          expired.push(sub.id);
        } else {
          log.error('push.sendFailed', {
            userId,
            status,
            error: String(error),
          });
        }
      }
    })
  );

  // 無効になった購読を掃除する
  if (expired.length > 0) {
    log.info('push.expiredRemoved', { userId, count: expired.length });
    await supabase.from('push_subscriptions').delete().in('id', expired);
  }

  if (sent > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('user_id', userId);
  }

  log.info('push.sent', {
    userId,
    title: payload.title,
    sent,
    failed,
    devices: subs.length,
  });

  return { sent, failed };
}

/** 複数人へまとめて送る */
export async function notifyUsers(
  supabase: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
  kind: 'shift' | 'shift_cancelled' | 'reminder' | 'other' = 'shift'
): Promise<void> {
  await Promise.all(
    Array.from(new Set(userIds)).map((id) =>
      notifyUser(supabase, id, payload, kind).catch((error) => {
        // 1人分の失敗で全体を止めない
        log.error('push.userFailed', { userId: id, error: String(error) });
      })
    )
  );
}
