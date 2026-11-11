import type { Stay } from '@/app/types/domain';
import type { CleaningStatus } from '@/app/lib/domain/stays';
import { stayNights } from '@/app/lib/domain/stays';
import { formatDateShort } from '@/app/lib/domain/datetime';

// ホームとカレンダーで共通に使う、宿泊の出入りの表示部品。
// 場所によって表し方が違うと見間違えるので、ここに揃える。

/**
 * 「チェックイン」と「チェックアウト」は字面が似ていて見間違えやすい。
 * 文字だけに頼らず、色（緑＝入る／橙＝出る）と矢印でも分ける。
 */
const MOVE_BADGE = {
  in: { label: 'IN', arrow: '↓', title: 'チェックイン', className: 'bg-emerald-600 text-white' },
  out: { label: 'OUT', arrow: '↑', title: 'チェックアウト', className: 'bg-orange-500 text-white' },
  stay: { label: '滞在中', arrow: '', title: '滞在中', className: 'bg-sky-100 text-sky-700' },
  block: { label: 'ブロック', arrow: '', title: 'Airbnb で売り止め', className: 'bg-slate-200 text-slate-500' },
} as const;

export type MoveKind = keyof typeof MOVE_BADGE;

export function MoveBadge({ kind }: { kind: MoveKind }) {
  const b = MOVE_BADGE[kind];
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center gap-0.5 w-14 py-1 rounded-md text-[11px] font-black tracking-wide ${b.className}`}
      title={b.title}
    >
      {b.arrow && <span aria-hidden>{b.arrow}</span>}
      {b.label}
    </span>
  );
}

/** 「11/12(木) → 11/14(土)・2泊」 */
export function StayRange({
  stay,
  showNights = true,
}: {
  stay: Pick<Stay, 'checkIn' | 'checkOut'>;
  showNights?: boolean;
}) {
  return (
    <span className="tabular-nums">
      {formatDateShort(stay.checkIn)} → {formatDateShort(stay.checkOut)}
      {showNights && (
        <span className="ml-1.5 font-bold text-slate-700">{stayNights(stay)}泊</span>
      )}
    </span>
  );
}

export const CLEANING_BADGE: Record<CleaningStatus, { icon: string; label: string; className: string }> = {
  ready: { icon: '✅', label: '清掃OK', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  unassigned: { icon: '🟡', label: '担当未確定', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  missing: { icon: '🔴', label: '清掃未手配', className: 'bg-red-50 text-red-600 border-red-200' },
};

/** 人数。未入力なら点線の枠で目立たせる */
export function GuestCount({ count }: { count: number | null }) {
  return count ? (
    <span className="font-semibold text-slate-600">{count}名</span>
  ) : (
    <span className="px-1 rounded border border-dashed border-slate-400 text-slate-500 font-normal">
      人数未記入
    </span>
  );
}

export const CLEANING_DOT = {
  missing: { className: 'bg-red-500 ring-red-100', label: '清掃未手配' },
  unassigned: { className: 'bg-amber-400 ring-amber-100', label: '担当未確定' },
  ready: { className: 'bg-emerald-500 ring-emerald-100', label: '清掃OK' },
  past: { className: 'bg-slate-300 ring-slate-100', label: '過ぎた日' },
} as const;

/** その日のチェックインのうち、一番手配が遅れている状態で点の色を決める */
export function cleaningDotOf(
  statuses: (CleaningStatus | undefined)[],
  isPastDay: boolean
): (typeof CLEANING_DOT)[keyof typeof CLEANING_DOT] {
  if (isPastDay) return CLEANING_DOT.past;
  if (statuses.some((s) => s === 'missing' || s === undefined)) return CLEANING_DOT.missing;
  if (statuses.some((s) => s === 'unassigned')) return CLEANING_DOT.unassigned;
  return CLEANING_DOT.ready;
}
