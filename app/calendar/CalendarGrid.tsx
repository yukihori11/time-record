'use client';

import type { DayActual, Shift, UserProfile } from '@/app/types/domain';
import type { ScheduleEntry } from '@/app/lib/domain/occupancy';
import { calendarCells, shiftsByDate } from '@/app/lib/domain/occupancy';
import { todayJst } from '@/app/lib/domain/datetime';
import { formatDuration } from '@/app/lib/domain/format';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const STATUS_DOT: Record<Shift['status'], string> = {
  accepted: 'bg-emerald-500',
  assigned: 'bg-amber-400',
  declined: 'bg-red-400',
};

const STATUS_TEXT: Record<Shift['status'], string> = {
  accepted: 'text-emerald-700',
  assigned: 'text-amber-700',
  declined: 'text-red-500 line-through',
};

/**
 * 月カレンダー。
 *
 * 予定は1日で完結するため、日付のマスの中に積むだけでよい。
 * 期間をまたぐ帯の配置は不要。
 */
export default function CalendarGrid({
  month,
  scheduleMap,
  shifts,
  users,
  actuals,
  onSelect,
  selectedDate,
}: {
  month: string;
  /** 日付ごとの予定 */
  scheduleMap: Map<string, ScheduleEntry[]>;
  shifts: Shift[];
  users: UserProfile[];
  /** 日付ごとの実績。打刻した時間を出す */
  actuals: Record<string, DayActual[]>;
  onSelect: (date: string) => void;
  selectedDate: string | null;
}) {
  const today = todayJst();
  const shiftMap = shiftsByDate(shifts, users);
  const cells = calendarCells(month);

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

        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) {
              return <div key={`pad-${i}`} className="min-h-[84px]" />;
            }

            const isToday = date === today;
            const isSelected = date === selectedDate;
            const daySchedules = scheduleMap.get(date) ?? [];
            const dayShifts = shiftMap.get(date) ?? [];
            const dayActuals = actuals[date] ?? [];

            return (
              <button
                key={date}
                onClick={() => onSelect(date)}
                className={`
                  min-h-[84px] p-1 rounded-lg border text-left align-top
                  transition-colors overflow-hidden
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
                  className={`text-xs font-bold mb-0.5 ${
                    isToday ? 'text-blue-600' : 'text-slate-700'
                  }`}
                >
                  {Number(date.slice(-2))}
                </div>

                {/* その日の予定 */}
                <div className="space-y-0.5">
                  {daySchedules.slice(0, 2).map((e) => {
                    const hasGuests = e.type?.hasGuests !== false;
                    return (
                      <div
                        key={e.schedule.id}
                        className="text-[9px] leading-[13px] px-1 py-0.5 rounded text-white font-bold truncate"
                        style={{ backgroundColor: e.type?.color ?? '#94a3b8' }}
                        title={`${e.property?.name ?? ''} ${e.type?.name ?? ''}`}
                      >
                        {e.type?.icon} {e.property?.name}
                        {hasGuests && e.schedule.guestCount > 0 && (
                          <span className="ml-0.5">
                            {e.schedule.guestCount}名
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {daySchedules.length > 2 && (
                    <div className="text-[9px] text-slate-400 leading-[13px] pl-0.5">
                      +{daySchedules.length - 2}件
                    </div>
                  )}
                </div>

                {/* その日に入るスタッフ。打刻済みなら実績時間を出す */}
                {dayShifts.length > 0 && (
                  <div className="mt-0.5 space-y-0.5">
                    {dayShifts.slice(0, 2).map((s) => {
                      const actual = dayActuals.find(
                        (a) => a.userId === s.userId
                      );

                      return (
                        <div
                          key={s.id}
                          className="flex items-center gap-0.5 leading-[13px]"
                          title={`${s.name} ${s.startTime ?? ''}`}
                        >
                          <span
                            className={`w-1 h-1 rounded-full shrink-0 ${STATUS_DOT[s.status]}`}
                          />
                          <span
                            className={`text-[9px] font-semibold truncate ${STATUS_TEXT[s.status]}`}
                          >
                            {s.name}
                            {actual ? (
                              <span
                                className={`font-normal ${
                                  actual.isWorking
                                    ? 'text-emerald-600'
                                    : 'text-slate-500'
                                }`}
                              >
                                {' '}
                                {formatDuration(actual.actualWorkMs)}
                              </span>
                            ) : (
                              s.startTime && (
                                <span className="font-normal opacity-80">
                                  {' '}
                                  {s.startTime}
                                </span>
                              )
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {dayShifts.length > 2 && (
                      <div className="text-[9px] text-slate-400 leading-[13px] pl-1.5">
                        +{dayShifts.length - 2}
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
