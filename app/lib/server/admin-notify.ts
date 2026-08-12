import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { log } from '@/app/lib/api/logger';
import { formatDateJa } from '@/app/lib/domain/datetime';

/**
 * 管理者への通知。
 *
 * スタッフがシフトに回答したことを知らせる。
 * 特に辞退は代わりを探す必要があるため、早く気づけることが重要。
 *
 * スタッフの権限では管理者を検索できない（RLS）ため、
 * DB 側の SECURITY DEFINER 関数を経由する。
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

interface ShiftResponseInput {
  staffName: string;
  response: 'accepted' | 'declined';
  shiftDate: string;
  propertyName?: string | null;
  startTime?: string | null;
  reason?: string | null;
}

/**
 * シフトへの回答を管理者に知らせる。
 *
 * 通知は「届けば嬉しい」もので、失敗しても回答そのものは
 * 成立させる。そのため例外はここで止める。
 */
export async function notifyAdminsOfShiftResponse(
  supabase: SupabaseClient,
  input: ShiftResponseInput
): Promise<void> {
  try {
    const accepted = input.response === 'accepted';

    const title = accepted
      ? `${input.staffName}さんがシフトを承諾しました`
      : `${input.staffName}さんがシフトを辞退しました`;

    const lines = [
      formatDateJa(input.shiftDate) +
        (input.startTime ? ` ${input.startTime}入り` : ''),
      input.propertyName ?? '',
      !accepted && input.reason ? `理由: ${input.reason}` : '',
      !accepted ? '代わりの担当を決めてください' : '',
    ].filter(Boolean);

    const body = lines.join('\n');
    const link = '/calendar';

    // まず記録を残す。プッシュが届かなくても画面で確認できる。
    const { data: count, error } = await supabase.rpc('notify_admins', {
      p_title: title,
      p_body: body,
      p_link: link,
      p_kind: accepted ? 'shift' : 'shift_cancelled',
    });

    if (error) {
      // PGRST202 は関数が存在しない印。マイグレーション 0023 が
      // 未適用の環境では通知を諦めるだけにして、回答は成立させる。
      if (error.code === 'PGRST202') {
        log.warn('adminNotify.migrationMissing', {
          message:
            'マイグレーション 0023 が未適用のため管理者通知を送れません',
        });
        return;
      }

      log.error('adminNotify.recordFailed', {
        reason: error.message,
        code: error.code,
      });
      return;
    }

    log.info('adminNotify.recorded', {
      response: input.response,
      staffName: input.staffName,
      admins: count ?? 0,
    });

    if (!ensureConfigured()) {
      log.warn('adminNotify.notConfigured', {
        message: 'VAPID キーが未設定のためプッシュを送れません',
      });
      return;
    }

    // 管理者の送信先を取得する。
    //
    // push_subscriptions の RLS は「自分の購読のみ」なので、
    // スタッフの権限では管理者の行を読めない。
    // 専用の関数を経由する。
    const { data: targets, error: targetError } = await supabase.rpc(
      'admin_push_targets'
    );

    if (targetError) {
      if (targetError.code === 'PGRST202') {
        log.warn('adminNotify.migrationMissing', {
          message:
            'マイグレーション 0024 が未適用のため管理者へ送信できません',
        });
        return;
      }
      log.error('adminNotify.targetsFailed', { reason: targetError.message });
      return;
    }

    const subs = (targets ?? []) as {
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }[];

    if (subs.length === 0) {
      log.info('adminNotify.noSubscription', {
        message: '管理者が通知を有効にしていません',
      });
      return;
    }

    const message = JSON.stringify({
      title,
      body,
      link,
      tag: `shift-${input.response}`,
    });

    let sent = 0;
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
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            expired.push(sub.id);
          } else {
            log.error('adminNotify.sendFailed', { status });
          }
        }
      })
    );

    // 無効になった購読に印を付ける。
    // 消してしまうと端末側が気づけず復旧できないため、
    // 残したうえで送信対象から外す（push.ts と同じ方針）。
    if (expired.length > 0) {
      await supabase
        .rpc('mark_push_failed', { p_ids: expired })
        .then(undefined, () => {});
    }

    log.info('adminNotify.sent', {
      response: input.response,
      sent,
      devices: subs.length,
    });
  } catch (error) {
    // 通知の失敗で回答を巻き戻さない
    log.error('adminNotify.failed', { error: String(error) });
  }
}
