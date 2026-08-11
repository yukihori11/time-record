'use client';

import type { DayOccupancy } from '@/app/lib/domain/occupancy';
import { todayJst } from '@/app/lib/domain/datetime';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function CalendarGrid({
  month,
  days,
  onSelect,
  selectedDate,
}: {
  month: string;
  days: DayOccupancy[];
  onSelect: (date: string) => void;
  selectedDate: string | null;
}) {
  const [year, mon] = month.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  const today = todayJst();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-2">
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-xs font-bold py-1.5 ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}

        {days.map((day) => {
          const dayNum = Number(day.date.slice(-2));
          const isToday = day.date === today;
          const isSelected = day.date === selectedDate;

          return (
            <button
              key={day.date}
              onClick={() => onSelect(day.date)}
              className={`
                min-h-[62px] p-1 rounded-lg border text-left transition-colors
                ${isSelected
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : isToday
                    ? 'border-blue-300 bg-blue-50/40'
                    : 'border-slate-100 hover:bg-slate-50'}
              `}
            >
              <div
                className={`text-xs font-bold mb-0.5 ${
                  isToday ? 'text-blue-600' : 'text-slate-700'
                }`}
              >
                {dayNum}
              </div>

              {/* 棟ごとの色帯 */}
              <div className="space-y-0.5">
                {day.stays.slice(0, 3).map((stay) => (
                  <div
                    key={stay.reservation.id}
                    className="text-[10px] leading-tight px-1 py-0.5 rounded text-white font-semibold truncate"
                    style={{
                      backgroundColor: stay.property?.color ?? '#94a3b8',
                    }}
                    title={`${stay.property?.name ?? '不明'} ${stay.reservation.guestCount}名`}
                  >
                    {stay.reservation.guestCount}名
                  </div>
                ))}
                {day.stays.length > 3 && (
                  <div className="text-[10px] text-slate-400 px-1">
                    +{day.stays.length - 3}
                  </div>
                )}
              </div>

              {/* シフトが入っている日の印 */}
              {day.shifts.length > 0 && (
                <div className="mt-0.5 flex gap-0.5">
                  {day.shifts.slice(0, 4).map((s) => (
                    <span
                      key={s.id}
                      className={`w-1.5 h-1.5 rounded-full ${
                        s.status === 'accepted'
                          ? 'bg-emerald-500'
                          : s.status === 'declined'
                            ? 'bg-red-400'
                            : 'bg-amber-400'
                      }`}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
