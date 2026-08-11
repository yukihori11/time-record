'use client';

import { useEffect, useState } from 'react';
import type { WorkSession } from '@/app/types/domain';
import { actualWorkMs, grossWorkMs, totalBreakMs } from '@/app/lib/domain/worktime';

/**
 * 経過時間を1秒ごとに再計算する。
 *
 * 加算方式（前回値に+1秒）ではなく、毎回 now - clockIn - 休憩 で
 * 計算し直すのが重要。ブラウザはバックグラウンドのタブで
 * setInterval を抑制するため、加算方式だと表示が実際より遅れる。
 * 都度計算なら、タブが復帰した瞬間に正しい値になる。
 */
export function useElapsed(session: WorkSession | null, clockOffset = 0) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (!session || session.clockOut) return;

    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [session]);

  if (!session) {
    return { workMs: 0, breakMs: 0, grossMs: 0 };
  }

  const now = new Date(tick + clockOffset);

  return {
    workMs: actualWorkMs(session, now),
    breakMs: totalBreakMs(session.breaks, now),
    grossMs: grossWorkMs(session, now),
  };
}
