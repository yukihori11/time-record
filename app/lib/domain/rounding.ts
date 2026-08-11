import type { RoundingMode } from '@/app/types/domain';

/**
 * 労働時間（分）を指定単位で丸める。
 *
 * 時刻そのものではなく「時間の長さ」を丸める点に注意。
 * 例: 15分単位・切り上げなら 2時間5分 → 2時間15分
 *
 * ちょうど単位で割り切れる場合は切り上げでも増やさない（境界バグの定番）。
 */
export function roundMinutes(
  minutes: number,
  unit: number,
  mode: RoundingMode
): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  if (!Number.isFinite(unit) || unit <= 0) return Math.floor(minutes);

  const quotient = minutes / unit;

  // 浮動小数の誤差で 3.0000000001 のようになった場合に
  // 切り上げが1単位増えてしまうのを防ぐ
  const EPSILON = 1e-9;

  if (mode === 'up') {
    return Math.ceil(quotient - EPSILON) * unit;
  }
  return Math.floor(quotient + EPSILON) * unit;
}
