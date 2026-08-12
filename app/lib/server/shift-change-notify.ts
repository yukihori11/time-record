import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyUser } from './push';
import { formatDateJa } from '@/app/lib/domain/datetime';
import { log } from '@/app/lib/api/logger';

/**
 * 管理者がシフトを変更したことを、担当のスタッフに知らせる。
 *
 * 日付や時刻が変わったのに気づかないと、来る日を間違える。
 * 割り当てを解除された場合も、来なくてよいと分かる必要がある。
 *
 * 通知は「届けば嬉しい」もので、失敗しても変更そのものは
 * 成立させる。そのため例外はここで止める。
 */

interface ShiftSnapshot {
  userId: string;
  shiftDate: string;
  startTime: string | null;
  endTime: string | null;
  propertyId: string | null;
  status: string;
  note: string | null;
}

/** 変更前と後を見比べて、本人に伝えるべき違いを文にする */
function describeChanges(
  before: ShiftSnapshot,
  after: ShiftSnapshot,
  propertyNames: Map<string, string>
): string[] {
  const lines: string[] = [];

  if (before.shiftDate !== after.shiftDate) {
    lines.push(
      `日付: ${formatDateJa(before.shiftDate)} → ${formatDateJa(after.shiftDate)}`
    );
  }

  if (before.startTime !== after.startTime) {
    lines.push(
      `開始: ${before.startTime ?? '未定'} → ${after.startTime ?? '未定'}`
    );
  }

  if (before.endTime !== after.endTime) {
    lines.push(`終了: ${before.endTime ?? '未定'} → ${after.endTime ?? '未定'}`);
  }

  if (before.propertyId !== after.propertyId) {
    const from = before.propertyId
      ? (propertyNames.get(before.propertyId) ?? '棟')
      : '未定';
    const to = after.propertyId
      ? (propertyNames.get(after.propertyId) ?? '棟')
      : '未定';
    lines.push(`場所: ${from} → ${to}`);
  }

  if ((before.note ?? '') !== (after.note ?? '')) {
    lines.push(after.note ? `メモ: ${after.note}` : 'メモが削除されました');
  }

  return lines;
}

/**
 * 管理者による変更を本人に知らせる。
 *
 * status だけが変わった場合は扱いを分ける。
 * 未回答に戻されたのなら、改めて回答してもらう必要がある。
 */
export async function notifyStaffOfShiftChange(
  supabase: SupabaseClient,
  before: ShiftSnapshot,
  after: ShiftSnapshot
): Promise<void> {
  try {
    // 棟の名前を引く。変更前後どちらの棟も必要。
    const ids = [before.propertyId, after.propertyId].filter(
      (v): v is string => Boolean(v)
    );

    const propertyNames = new Map<string, string>();
    if (ids.length > 0) {
      const { data } = await supabase
        .from('properties')
        .select('id, name')
        .in('id', Array.from(new Set(ids)));

      for (const p of (data ?? []) as { id: string; name: string }[]) {
        propertyNames.set(p.id, p.name);
      }
    }

    const changes = describeChanges(before, after, propertyNames);
    const resetToAssigned =
      before.status !== 'assigned' && after.status === 'assigned';

    // 何も変わっていないなら送らない。
    // 保存を押しただけで通知が飛ぶのは鬱陶しい。
    if (changes.length === 0 && !resetToAssigned) {
      log.info('shiftChange.noDiff', { userId: after.userId });
      return;
    }

    const title = resetToAssigned
      ? 'シフトの回答をやり直してください'
      : 'シフトが変更されました';

    const body = [
      formatDateJa(after.shiftDate) +
        (after.startTime ? ` ${after.startTime}入り` : ''),
      after.propertyId ? (propertyNames.get(after.propertyId) ?? '') : '',
      ...changes,
      resetToAssigned ? '承諾または辞退を回答してください' : '',
    ]
      .filter(Boolean)
      .join('\n');

    await notifyUser(
      supabase,
      after.userId,
      { title, body, link: '/shifts', tag: 'shift-changed' },
      'shift'
    );

    log.info('shiftChange.notified', {
      userId: after.userId,
      changes: changes.length,
      resetToAssigned,
    });
  } catch (error) {
    log.error('shiftChange.failed', { error: String(error) });
  }
}

/**
 * 割り当てを解除したことを本人に知らせる。
 *
 * 承諾済みだった場合は特に重要。
 * 来る予定でいるため、伝わらないと当日その場に現れる。
 */
export async function notifyStaffOfShiftRemoval(
  supabase: SupabaseClient,
  shift: ShiftSnapshot
): Promise<void> {
  try {
    let propertyName = '';
    if (shift.propertyId) {
      const { data } = await supabase
        .from('properties')
        .select('name')
        .eq('id', shift.propertyId)
        .maybeSingle();
      propertyName = (data as { name?: string } | null)?.name ?? '';
    }

    const body = [
      formatDateJa(shift.shiftDate) +
        (shift.startTime ? ` ${shift.startTime}入り` : ''),
      propertyName,
      'このシフトは担当から外れました',
    ]
      .filter(Boolean)
      .join('\n');

    await notifyUser(
      supabase,
      shift.userId,
      {
        title: 'シフトの割り当てが解除されました',
        body,
        link: '/shifts',
        tag: 'shift-removed',
      },
      'shift_cancelled'
    );

    log.info('shiftRemoval.notified', { userId: shift.userId });
  } catch (error) {
    log.error('shiftRemoval.failed', { error: String(error) });
  }
}
