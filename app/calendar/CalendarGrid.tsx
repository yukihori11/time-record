'use client';

import type { Shift } from '@/app/types/domain';
import type { WeekRow } from '@/app/lib/domain/occupancy';
import { todayJst } from '@/app/lib/domain/datetime';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const BAR_HEIGHT = 20;
const BAR_GAP = 2;

/**
 * 月カレンダー。
 *
 * 連泊は日付をまたぐ1本の帯で表示する。
 * 週の境界で切れるが、切れた側の角を丸めないことで
 * 「続いている」ことが分かるようにしている。
 */
export default function CalendarGrid({
  weeks,
  shifts,
  onSelect,
  selectedDate,
}: {
  weeks: WeekRow[];
  shifts: Shift[];
  onSelect: (date: string) => void;
  selectedDate: string | null;
}) {
  const today = todayJst();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-2 overflow-x-auto">
      <div className="min-w-[320px]">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`text-center text-xs font-bold py-1.5 ${
                i === 0
                  ? 'text-red-500'
                  : i === 6
                    ? 'text-blue-500'
                    : 'text-slate-400'
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        {weeks.map((week, wi) => {
          const laneCount = week.bars.reduce(
            (max, b) => Math.max(max, b.lane + 1),
            0
          );
          const barsHeight = laneCount * (BAR_HEIGHT + BAR_GAP);

          return (
            <div key={wi} className="relative mb-1">
              {/* 日付のマス */}
              <div className="grid grid-cols-7 gap-1">
                {week.days.map((date, di) => {
                  if (!date) {
                    return <div key={di} className="min-h-[76px]" />;
                  }

                  const isToday = date === today;
                  const isSelected = date === selectedDate;
                  const dayShifts = shifts.filter((s) => s.shiftDate === date);

                  return (
                    <button
                      key={date}
                      onClick={() => onSelect(date)}
                      style={{ paddingBottom: barsHeight + 4 }}
                      className={`
                        min-h-[76px] p-1 rounded-lg border text-left transition-colors
                        ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : isToday
                              ? 'border-blue-300 bg-blue-50/40'
                              : 'border-slate-100 hover:bg-slate-50'
                        }
                      `}
                    >
                      <div
                        className={`text-xs font-bold ${
                          isToday ? 'text-blue-600' : 'text-slate-700'
                        }`}
                      >
                        {Number(date.slice(-2))}
                      </div>

                      {/* シフトに入る人の印 */}
                      {dayShifts.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {dayShifts.slice(0, 4).map((s) => (
                            <span
                              key={s.id}
                              className={`w-1.5 h-1.5 rounded-full ${
                                s.status === 'accepted'
                                  ? 'bg-emerald-500'
                                  : s.status === 'declined'
                                    ? 'bg-red-400'
                                    : 'bg-amber-400'
                              }`}
                              title={
                                s.status === 'accepted'
                                  ? '承諾済み'
                                  : s.status === 'declined'
                                    ? '辞退'
                                    : '未回答'
                              }
                            />
                          ))}
                          {dayShifts.length > 4 && (
                            <span className="text-[9px] text-slate-400 leading-none">
                              +{dayShifts.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 帯を日付マスの上に重ねる */}
              <div
                className="absolute inset-x-0 pointer-events-none"
                style={{ bottom: 4 }}
              >
                {week.bars.map((bar) => {
                  const color = bar.type?.color ?? '#94a3b8';
                  const leftPct = (bar.startCol / 7) * 100;
                  const widthPct = (bar.span / 7) * 100;

                  return (
                    <div
                      key={`${bar.reservation.id}-${bar.startCol}`}
                      className="absolute px-0.5"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        bottom: bar.lane * (BAR_HEIGHT + BAR_GAP),
                        height: BAR_HEIGHT,
                      }}
                    >
                      <div
                        className="h-full flex items-center px-1.5 text-[10px] font-bold text-white truncate"
                        style={{
                          backgroundColor: color,
                          // 週をまたいで続く側は角を丸めない
                          borderTopLeftRadius: bar.isStart ? 6 : 0,
                          borderBottomLeftRadius: bar.isStart ? 6 : 0,
                          borderTopRightRadius: bar.isEnd ? 6 : 0,
                          borderBottomRightRadius: bar.isEnd ? 6 : 0,
                        }}
                        title={`${bar.property?.name ?? ''} ${bar.type?.name ?? ''}`}
                      >
                        {bar.isStart && (
                          <>
                            {bar.type?.icon && (
                              <span className="mr-0.5">{bar.type.icon}</span>
                            )}
                            <span className="truncate">
                              {bar.property?.name}
                              {bar.type?.hasGuests !== false &&
                                bar.reservation.guestCount > 0 &&
                                ` ${bar.reservation.guestCount}名`}
                            </span>
                          </>
                        )}
                        {!bar.isStart && (
                          <span className="truncate opacity-90">
                            {bar.property?.name} つづき
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
