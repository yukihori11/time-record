import type { HourlyWage } from '@/app/types/domain';

/**
 * 指定日に有効な時給を返す。
 *
 * effective_from <= 対象日 を満たす中で最新のものを選ぶ。
 * 「過去月は当時の時給で固定される」のはこの関数だけで実現される。
 * 給与額をDBに保存しないのはこのため。
 *
 * 該当なし（初回の時給設定より前の勤務）は null。
 */
export function resolveWage(
  history: HourlyWage[],
  date: string
): number | null {
  let best: HourlyWage | null = null;

  for (const w of history) {
    if (w.effectiveFrom <= date) {
      if (!best || w.effectiveFrom > best.effectiveFrom) {
        best = w;
      }
    }
  }

  return best ? best.hourlyWage : null;
}

/** 現在有効な時給 */
export function currentWage(
  history: HourlyWage[],
  today: string
): number | null {
  return resolveWage(history, today);
}
