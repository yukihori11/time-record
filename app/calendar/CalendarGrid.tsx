'use client';

import type {
  DayActual,
  Property,
  Shift,
  Stay,
  UserProfile,
} from '@/app/types/domain';
import type { ScheduleEntry } from '@/app/lib/domain/occupancy';
import { calendarCells, shiftsByDate } from '@/app/lib/domain/occupancy';
import type { CleaningStatus, StayBar } from '@/app/lib/domain/stays';
import {
  calendarWeeks,
  checkInsByDate,
  weekStayBars,
} from '@/app/lib/domain/stays';
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

export const CLEANING_MARK: Record<CleaningStatus, { icon: string; label: string }> = {
  ready: { icon: '✅', label: '清掃OK' },
  unassigned: { icon: '🟡', label: '担当未確定' },
  missing: { icon: '🔴', label: '清掃未手配' },
};

/** 日付の数字の下に置く、棟1つ分の帯の段の高さ（px） */
const LANE_HEIGHT = 18;
/** 日付の数字の行の高さ（px） */
const DATE_ROW_HEIGHT = 18;

/**
 * 月カレンダー。
 *
 * Airbnb の宿泊は週ごとに棟ごとの段を作り、チェックインから
 * チェックアウトまでの帯で描く。予定（清掃など）とシフトは
 * これまでどおり日付のマスの中に積む。
 *
 * 帯はマスの上に重ねて置く。マスはボタンなので、帯を中に入れると
 * ボタンの入れ子になり押せなくなるため。
 */
export default function CalendarGrid({
  month,
  scheduleMap,
  shifts,
  users,
  actuals,
  properties,
  stays,
  cleaning,
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
  properties: Property[];
  stays: Stay[];
  /** 宿泊ごとのチェックイン当日の清掃の状態 */
  cleaning: Map<string, CleaningStatus>;
  onSelect: (date: string) => void;
  selectedDate: string | null;
}) {
  const today = todayJst();
  const shiftMap = shiftsByDate(shifts, users);
  const weeks = calendarWeeks(calendarCells(month));
  const checkIns = checkInsByDate(stays);

  // 宿泊が1件も無い月でも、棟の段は出しておく。
  // 週ごとに高さが変わると読みにくいため
  const lanes = stays.length > 0 ? properties : [];
  const lanesHeight = lanes.length * LANE_HEIGHT;

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

        <div className="space-y-1">
          {weeks.map((week) => {
            const bars = weekStayBars(week.weekStart, stays);

            return (
              <div key={week.weekStart} className="relative">
                <div className="grid grid-cols-7 gap-1">
                  {week.days.map(({ date, inMonth }) => {
                    if (!inMonth) {
                      return (
                        <div
                          key={date}
                          className="min-h-[84px]"
                          style={{ paddingTop: DATE_ROW_HEIGHT + lanesHeight }}
                        />
                      );
                    }

                    const isToday = date === today;
                    const isSelected = date === selectedDate;
                    const daySchedules = scheduleMap.get(date) ?? [];
                    const dayShifts = shiftMap.get(date) ?? [];
                    const dayActuals = actuals[date] ?? [];

                    const dayCheckIns = checkIns.get(date) ?? [];
                    const checkInProperties = new Set(dayCheckIns.map((s) => s.propertyId));
                    // 2棟以上で同じ日にチェックインがある日は、清掃が重なるので目立たせる
                    const isMultiCheckIn = checkInProperties.size >= 2;
                    const hasMissingCleaning =
                      date >= today &&
                      dayCheckIns.some((s) => cleaning.get(s.id) === 'missing');

                    return (
                      <button
                        key={date}
                        onClick={() => onSelect(date)}
                        className={`
                          min-h-[84px] p-1 rounded-lg border text-left
                          flex flex-col justify-start
                          transition-colors overflow-hidden
                          ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                              : isMultiCheckIn
                                ? 'border-amber-400 bg-amber-50'
                                : isToday
                                  ? 'border-blue-300 bg-blue-50/40'
                                  : 'border-slate-100 hover:bg-slate-50'
                          }
                        `}
                      >
                        <div
                          className="flex items-center justify-between gap-0.5"
                          style={{ height: DATE_ROW_HEIGHT - 2 }}
                        >
                          <span
                            className={`text-xs font-bold ${
                              isToday ? 'text-blue-600' : 'text-slate-700'
                            }`}
                          >
                            {Number(date.slice(-2))}
                          </span>
                          {isMultiCheckIn ? (
                            <span className="text-[8px] font-bold leading-none px-1 py-0.5 rounded bg-amber-500 text-white">
                              IN×{checkInProperties.size}
                            </span>
                          ) : (
                            hasMissingCleaning && (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            )
                          )}
                        </div>

                        {/* 帯の段のぶん空ける（帯は上に重ねて描く） */}
                        <div style={{ height: lanesHeight }} />

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

                {/* 棟ごとの宿泊の帯 */}
                {lanes.map((p, laneIndex) => (
                  <div
                    key={p.id}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                      top: DATE_ROW_HEIGHT + 4 + laneIndex * LANE_HEIGHT,
                      height: LANE_HEIGHT - 3,
                    }}
                  >
                    {(bars.get(p.id) ?? []).map((bar) => (
                      <StayBarView
                        key={bar.stay.id}
                        bar={bar}
                        property={p}
                        cleaning={cleaning.get(bar.stay.id)}
                        month={month}
                        onSelect={onSelect}
                      />
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StayBarView({
  bar,
  property,
  cleaning,
  month,
  onSelect,
}: {
  bar: StayBar;
  property: Property;
  cleaning: CleaningStatus | undefined;
  month: string;
  onSelect: (date: string) => void;
}) {
  const { stay } = bar;
  const isBlocked = stay.kind === 'blocked';

  const left = `${(bar.start / 7) * 100}%`;
  const width = `calc(${((bar.end - bar.start) / 7) * 100}% - 2px)`;

  // 押したら、その週で見えている側の日を選ぶ。
  // チェックインが見えていればチェックイン日、そうでなければ週の最初の日
  const target = bar.startsHere ? stay.checkIn : null;
  const selectable = target !== null && target.startsWith(month);

  if (isBlocked) {
    return (
      <div
        className="absolute top-0 bottom-0 rounded bg-slate-200/80"
        style={{ left, width }}
        title={`${property.name} ブロック ${stay.checkIn}〜${stay.checkOut}`}
      />
    );
  }

  const mark = cleaning ? CLEANING_MARK[cleaning] : null;

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={() => target && onSelect(target)}
      className={`
        absolute top-0 bottom-0 flex items-center gap-0.5 px-1 overflow-hidden
        text-[9px] font-bold text-white leading-none pointer-events-auto
        ${bar.startsHere ? 'rounded-l-full' : ''} ${bar.endsHere ? 'rounded-r-full' : ''}
      `}
      style={{ left, width, backgroundColor: property.color }}
      title={`${property.name} ${stay.checkIn}〜${stay.checkOut}${
        stay.guestCount ? ` ${stay.guestCount}名` : ' 人数未記入'
      }${mark && bar.startsHere ? ` / ${mark.label}` : ''}`}
    >
      {bar.startsHere && (
        <span className="shrink-0">
          IN{mark && <span className="ml-0.5">{mark.icon}</span>}
        </span>
      )}
      <span className="truncate">
        {stay.guestCount ? (
          `${stay.guestCount}名`
        ) : (
          <span className="px-0.5 rounded border border-dashed border-white/80 font-semibold">
            未記入
          </span>
        )}
      </span>
    </button>
  );
}
