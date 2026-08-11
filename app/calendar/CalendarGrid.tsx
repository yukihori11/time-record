'use client';

import type { UserProfile } from '@/app/types/domain';
import type { WeekRow } from '@/app/lib/domain/occupancy';
import { shiftsByDate } from '@/app/lib/domain/occupancy';
import { todayJst } from '@/app/lib/domain/datetime';
import type { Shift } from '@/app/types/domain';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 帯は2行（棟＋人数 / 種別）なので高さを確保する
const BAR_HEIGHT = 30;
const BAR_GAP = 2;

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
 * 連泊は日付をまたぐ1本の帯で表示する。
 * 週の境界で切れるが、切れた側の角を丸めないことで
 * 「続いている」ことが分かるようにしている。
 *
 * 担当スタッフは連泊中でも日ごとに変わるため、
 * 帯ではなく日付のマスの中に出す。
 */
export default function CalendarGrid({
  weeks,
  shifts,
  users,
  onSelect,
  selectedDate,
}: {
  weeks: WeekRow[];
  shifts: Shift[];
  users: UserProfile[];
  onSelect: (date: string) => void;
  selectedDate: string | null;
}) {
  const today = todayJst();
  const shiftMap = shiftsByDate(shifts, users);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-2 overflow-x-auto">
      <div className="min-w-[340px]">
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

          // その週で最も多いシフト件数に合わせて高さを揃える
          const maxShifts = week.days.reduce(
            (max, d) => Math.max(max, d ? (shiftMap.get(d)?.length ?? 0) : 0),
            0
          );
          const shiftsHeight = Math.min(maxShifts, 3) * 14;

          return (
            <div key={wi} className="relative mb-1">
              <div className="grid grid-cols-7 gap-1">
                {week.days.map((date, di) => {
                  if (!date) {
                    return <div key={di} className="min-h-[64px]" />;
                  }

                  const isToday = date === today;
                  const isSelected = date === selectedDate;

                  return (
                    <button
                      key={date}
                      onClick={() => onSelect(date)}
                      style={{ paddingBottom: barsHeight + shiftsHeight + 4 }}
                      className={`
                        min-h-[64px] p-1 rounded-lg border text-left transition-colors
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
                    </button>
                  );
                })}
              </div>

              {/* その日に入るスタッフ。帯の下に置く */}
              <div
                className="absolute inset-x-0 grid grid-cols-7 gap-1 pointer-events-none"
                style={{ bottom: 4, height: shiftsHeight }}
              >
                {week.days.map((date, di) => {
                  const dayShifts = date ? (shiftMap.get(date) ?? []) : [];
                  return (
                    <div key={di} className="px-0.5 overflow-hidden">
                      {dayShifts.slice(0, 3).map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-0.5 leading-[14px]"
                          title={`${s.name} ${s.startTime ?? ''}`}
                        >
                          <span
                            className={`w-1 h-1 rounded-full shrink-0 ${STATUS_DOT[s.status]}`}
                          />
                          <span
                            className={`text-[9px] font-semibold truncate ${STATUS_TEXT[s.status]}`}
                          >
                            {s.name}
                            {s.startTime && (
                              <span className="font-normal opacity-80">
                                {' '}
                                {s.startTime}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                      {dayShifts.length > 3 && (
                        <div className="text-[9px] text-slate-400 leading-[14px] pl-1.5">
                          +{dayShifts.length - 3}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 予定の帯。スタッフ表示の上に重ねる */}
              <div
                className="absolute inset-x-0 pointer-events-none"
                style={{ bottom: shiftsHeight + 4 }}
              >
                {week.bars.map((bar) => {
                  const color = bar.type?.color ?? '#94a3b8';
                  const hasGuests = bar.type?.hasGuests !== false;

                  return (
                    <div
                      key={`${bar.reservation.id}-${bar.startCol}`}
                      className="absolute px-0.5"
                      style={{
                        left: `${(bar.startCol / 7) * 100}%`,
                        width: `${(bar.span / 7) * 100}%`,
                        bottom: bar.lane * (BAR_HEIGHT + BAR_GAP),
                        height: BAR_HEIGHT,
                      }}
                    >
                      <div
                        className="h-full flex flex-col justify-center px-1.5 text-white overflow-hidden"
                        style={{
                          backgroundColor: color,
                          // 週をまたいで続く側は角を丸めない
                          borderTopLeftRadius: bar.isStart ? 6 : 0,
                          borderBottomLeftRadius: bar.isStart ? 6 : 0,
                          borderTopRightRadius: bar.isEnd ? 6 : 0,
                          borderBottomRightRadius: bar.isEnd ? 6 : 0,
                        }}
                        title={`${bar.property?.name ?? ''} ${bar.type?.name ?? ''}${
                          hasGuests && bar.reservation.guestCount > 0
                            ? ` ${bar.reservation.guestCount}名`
                            : ''
                        }`}
                      >
                        {bar.isStart ? (
                          <>
                            <span className="text-[10px] font-bold leading-[13px] truncate">
                              {bar.type?.icon} {bar.property?.name}
                              {hasGuests && bar.reservation.guestCount > 0 && (
                                <span className="ml-1">
                                  {bar.reservation.guestCount}名
                                </span>
                              )}
                            </span>
                            <span className="text-[9px] leading-[12px] truncate opacity-90">
                              {bar.type?.name}
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] font-bold leading-[13px] truncate opacity-90">
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
