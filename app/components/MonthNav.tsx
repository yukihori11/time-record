'use client';

import { formatMonthJa } from '@/app/lib/domain/datetime';

/** 月を1つ進める・戻す */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function MonthNav({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-slate-200 px-2 py-2">
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold"
        aria-label="前の月"
      >
        ‹
      </button>

      <span className="font-bold text-slate-900">{formatMonthJa(month)}</span>

      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold"
        aria-label="次の月"
      >
        ›
      </button>
    </div>
  );
}
