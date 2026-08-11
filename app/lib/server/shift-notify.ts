import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyUser } from './push';
import { formatDateJa } from '@/app/lib/domain/datetime';

interface ShiftInput {
  date: string;
  userId: string | null;
  startTime: string | null;
}

/**
 * シフトを割り当てたスタッフに通知する。
 *
 * 同じ人に複数日を割り当てた場合は1通にまとめる。
 * 日ごとに通知が飛ぶと鬱陶しいため。
 *
 * 通知は「届けば嬉しい」もので、失敗しても予約の作成を
 * 巻き戻してはいけない。例外はここで止める。
 */
export async function notifyShiftAssignment(
  supabase: SupabaseClient,
  shifts: ShiftInput[],
  propertyName?: string
): Promise<void> {
  try {
    const assigned = shifts.filter(
      (s): s is ShiftInput & { userId: string } => Boolean(s.userId)
    );
    if (assigned.length === 0) return;

    // 人ごとにまとめる
    const byUser = new Map<string, ShiftInput[]>();
    for (const s of assigned) {
      const list = byUser.get(s.userId);
      if (list) list.push(s);
      else byUser.set(s.userId, [s]);
    }

    await Promise.all(
      Array.from(byUser.entries()).map(([userId, list]) => {
        const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));

        const lines = sorted.map((s) => {
          const time = s.startTime ? ` ${s.startTime}入り` : '';
          return `${formatDateJa(s.date)}${time}`;
        });

        const title =
          sorted.length === 1
            ? 'シフトが割り当てられました'
            : `シフトが${sorted.length}件割り当てられました`;

        const body =
          (propertyName ? `${propertyName}\n` : '') +
          lines.slice(0, 4).join('\n') +
          (lines.length > 4 ? `\nほか${lines.length - 4}件` : '') +
          '\n承諾または辞退を回答してください';

        return notifyUser(
          supabase,
          userId,
          { title, body, link: '/shifts', tag: 'shift-assigned' },
          'shift'
        );
      })
    );
  } catch (error) {
    console.error('[shift-notify] 通知に失敗:', error);
  }
}
