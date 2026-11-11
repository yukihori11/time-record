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
  stayNights,
  weekStayBars,
} from '@/app/lib/domain/stays';
import { dayOfWeek, todayJst } from '@/app/lib/domain/datetime';
import { formatDuration } from '@/app/lib/domain/format';
import { useCalendarPrefs } from '@/app/lib/client/calendar-prefs';
import { CLEANING_BADGE } from '@/app/components/StayBadges';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** スタッフの丸の色。承諾＝塗り、未回答＝枠だけ、辞退＝薄く */
const STAFF_DOT: Record<Shift['status'], string> = {
  accepted: 'bg-emerald-500 text-white',
  assigned: 'bg-white text-amber-600 ring-1 ring-inset ring-amber-400',
  declined: 'bg-red-50 text-red-300 line-through',
};

const STAFF_STATUS_LABEL: Record<Shift['status'], string> = {
  accepted: '承諾',
  assigned: '未回答',
  declined: '辞退',
};

export const CLEANING_MARK: Record<CleaningStatus, { icon: string; label: string }> = CLEANING_BADGE;

/** 日付の下に並べる、棟1つ分の帯の段の高さ（px） */
const LANE_HEIGHT = 22;
/** 日付の横に並べる棟の点の最大数 */
const MAX_DOTS = 4;
/** 日付の行の高さ（px） */
const DATE_ROW_HEIGHT = 26;

/** '#rrggbb' に透明度を付ける。色の薄い背景を作るため */
function tint(color: string | undefined, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(color ?? '') ? `${color}${alpha}` : '#e2e8f0';
}

/**
 * 月カレンダー。
 *
 * Airbnb の宿泊は週ごとに棟ごとの段を作り、チェックインから
 * チェックアウトまでの帯で描く。帯には棟の名前と人数を入れ、
 * 色だけに頼らずどの棟か読めるようにする。
 *
 * マスには「何があるか」だけを小さく出し、名前・時間・実績は
 * 日付を押したときの詳細に回す。詰め込むと文字が小さくなりすぎるため。
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
  /** 日付ごとの実績。打刻した時間をスタッフの丸の説明に出す */
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
  // 何を目立たせるか（設定 →「カレンダーの表示」。その端末だけの設定）
  const prefs = useCalendarPrefs();


  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[11px] font-semibold py-2 ${
              i === 0 ? 'text-rose-500' : i === 6 ? 'text-sky-600' : 'text-slate-500'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      <div>
        {weeks.map((week) => {
          const bars = weekStayBars(week.weekStart, stays);
          // その週に宿泊がある棟だけ段を作る。全棟分を毎週確保すると、
          // 棟が増えるほど空の段だらけになり、マスが縦に伸びて読めなくなる
          const lanes = properties.filter((p) => bars.has(p.id));
          const lanesHeight = lanes.length * LANE_HEIGHT;

          return (
            <div
              key={week.weekStart}
              className="relative border-b border-slate-100 last:border-b-0"
            >
              <div className="grid grid-cols-7">
                {week.days.map(({ date, inMonth }) => {
                  const dow = dayOfWeek(date);
                  const dayNumber = Number(date.slice(-2));

                  if (!inMonth) {
                    return (
                      <div
                        key={date}
                        className="min-h-[92px] p-1 border-r border-slate-100 last:border-r-0 bg-slate-50/60"
                      >
                        <span className="inline-flex w-6 h-6 items-center justify-center text-xs text-slate-300">
                          {dayNumber}
                        </span>
                      </div>
                    );
                  }

                  const isToday = date === today;
                  const isSelected = date === selectedDate;
                  const isPastDay = date < today;
                  const daySchedules = scheduleMap.get(date) ?? [];
                  const dayShifts = shiftMap.get(date) ?? [];
                  const dayActuals = actuals[date] ?? [];

                  const dayCheckIns = checkIns.get(date) ?? [];
                  const checkInProperties = new Set(dayCheckIns.map((s) => s.propertyId));
                  // 2棟以上で同じ日にチェックインがある日は、清掃が重なるので目立たせる
                  const isMultiCheckIn = checkInProperties.size >= 2;
                  // チェックインがある日＝清掃が必要な日。チェックインする棟の色の点で示す。
                  // 手配の状況は帯の先頭の印で分かるので、点には持たせない
                  const checkInDots = prefs.showCheckInDots
                    ? properties.filter((p) => checkInProperties.has(p.id))
                    : [];
                  // マスを塗るか。重なる日の黄色を切っても、清掃の日なら薄緑で塗る
                  const canFill = !isPastDay || prefs.fillPastDays;
                  const fillMulti = canFill && prefs.fillMultiCheckIn && isMultiCheckIn;
                  const fillCleaning =
                    canFill && prefs.fillCleaningDays && checkInProperties.size > 0;

                  return (
                    <button
                      key={date}
                      onClick={() => onSelect(date)}
                      aria-label={`${Number(date.slice(5, 7))}月${dayNumber}日`}
                      aria-pressed={isSelected}
                      className={`
                        relative min-h-[92px] p-1 text-left flex flex-col
                        border-r border-slate-100 last:border-r-0
                        transition-colors overflow-hidden
                        ${
                          isSelected
                            ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 z-[1]'
                            : fillMulti
                              ? 'bg-amber-100 hover:bg-amber-200/70'
                              : fillCleaning
                                ? // 清掃に入る日（チェックインが1棟）。重なる日の黄色と見分ける
                                  'bg-green-100 hover:bg-green-200/70'
                                : 'hover:bg-slate-50'
                        }
                      `}
                    >
                      <div
                        className="flex items-start justify-between gap-0.5"
                        style={{ height: DATE_ROW_HEIGHT }}
                      >
                        <span
                          className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                            isToday
                              ? 'bg-blue-600 text-white'
                              : isPastDay
                                ? 'text-slate-400'
                                : dow === 0
                                  ? 'text-rose-500'
                                  : dow === 6
                                    ? 'text-sky-600'
                                    : 'text-slate-700'
                          }`}
                        >
                          {dayNumber}
                        </span>
                        {checkInDots.length > 0 && (
                          <span
                            className={`flex flex-wrap justify-end content-start gap-0.5 pt-1 max-w-[60%] ${
                              isPastDay ? 'opacity-40' : ''
                            }`}
                            title={`清掃の日（チェックイン：${checkInDots.map((p) => p.name).join('・')}）`}
                          >
                            {/* 棟が多い日は4つまで出し、残りは数で示す */}
                            {checkInDots.slice(0, MAX_DOTS).map((p) => (
                              <span
                                key={p.id}
                                className="w-2 h-2 rounded-full ring-1 ring-white"
                                style={{ backgroundColor: p.color }}
                              />
                            ))}
                            {checkInDots.length > MAX_DOTS && (
                              <span className="text-[8px] font-bold leading-[8px] text-slate-500">
                                +{checkInDots.length - MAX_DOTS}
                              </span>
                            )}
                          </span>
                        )}
                      </div>

                      {/* 帯の段のぶん空ける（帯は上に重ねて描く） */}
                      <div className="shrink-0" style={{ height: lanesHeight }} />

                      {/* その日の予定。種別の色の薄い札で出す */}
                      {daySchedules.length > 0 && (
                        <div className="mt-0.5 space-y-0.5">
                          {daySchedules.slice(0, 2).map((e) => (
                            <div
                              key={e.schedule.id}
                              className="text-[10px] leading-[15px] px-1 rounded font-semibold truncate"
                              style={{
                                backgroundColor: tint(e.type?.color, '22'),
                                color: e.type?.color ?? '#475569',
                              }}
                              title={`${e.property?.name ?? ''} ${e.type?.name ?? ''}`}
                            >
                              {e.type?.icon}
                              <span className="text-slate-700 ml-0.5">{e.property?.name}</span>
                            </div>
                          ))}
                          {daySchedules.length > 2 && (
                            <div className="text-[10px] text-slate-400 leading-[14px] pl-0.5">
                              他{daySchedules.length - 2}件
                            </div>
                          )}
                        </div>
                      )}

                      {/* その日に入るスタッフ。頭文字の丸で、状態は色で表す */}
                      {dayShifts.length > 0 && (
                        <div className="mt-auto pt-1 flex flex-wrap gap-0.5">
                          {dayShifts.slice(0, 4).map((s) => {
                            const actual = dayActuals.find((a) => a.userId === s.userId);
                            const detail = actual
                              ? ` 実績${formatDuration(actual.actualWorkMs)}`
                              : s.startTime
                                ? ` ${s.startTime}入り`
                                : '';
                            return (
                              <span
                                key={s.id}
                                className={`w-[18px] h-[18px] rounded-full inline-flex items-center justify-center text-[10px] font-bold ${STAFF_DOT[s.status]}`}
                                title={`${s.name}（${STAFF_STATUS_LABEL[s.status]}）${detail}`}
                              >
                                {Array.from(s.name)[0] ?? '?'}
                              </span>
                            );
                          })}
                          {dayShifts.length > 4 && (
                            <span className="text-[10px] text-slate-400 leading-[18px]">
                              +{dayShifts.length - 4}
                            </span>
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
                  className="absolute left-0 right-0 pointer-events-none z-[2]"
                  style={{
                    top: 4 + DATE_ROW_HEIGHT + laneIndex * LANE_HEIGHT,
                    height: LANE_HEIGHT - 4,
                  }}
                >
                  {(bars.get(p.id) ?? []).map((bar) => (
                    <StayBarView
                      key={bar.stay.id}
                      bar={bar}
                      property={p}
                      cleaning={cleaning.get(bar.stay.id)}
                      month={month}
                      showGuestCount={prefs.showGuestCount}
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
  );
}

function StayBarView({
  bar,
  property,
  cleaning,
  month,
  showGuestCount,
  onSelect,
}: {
  bar: StayBar;
  property: Property;
  cleaning: CleaningStatus | undefined;
  month: string;
  showGuestCount: boolean;
  onSelect: (date: string) => void;
}) {
  const { stay } = bar;
  const isBlocked = stay.kind === 'blocked';

  // 帯の両端は少し内側に寄せ、隣の帯（入れ替えの日）とくっつかないようにする
  const left = `calc(${(bar.start / 7) * 100}% + 1px)`;
  const width = `calc(${((bar.end - bar.start) / 7) * 100}% - 2px)`;

  // 押したら、その週で見えている側の日を選ぶ。
  // チェックインが見えていればチェックイン日、そうでなければ週の最初の日
  const target = bar.startsHere ? stay.checkIn : null;
  const selectable = target !== null && target.startsWith(month);

  const period = `${stay.checkIn}〜${stay.checkOut}（${stayNights(stay)}泊）`;

  // ブロック＝Airbnb で売り止めにしている期間（予約ではない）。
  // 斜線にして予約の帯と見分ける
  if (isBlocked) {
    return (
      <div
        className="absolute top-0 bottom-0 flex items-center px-1.5 overflow-hidden rounded-md text-[9px] font-semibold text-slate-500 leading-none"
        style={{
          left,
          width,
          backgroundImage:
            'repeating-linear-gradient(135deg, #e2e8f0 0 4px, #f1f5f9 4px 8px)',
        }}
        title={`${property.name} ブロック（Airbnb で売り止め） ${period}`}
      >
        <span className="truncate">ブロック</span>
      </div>
    );
  }

  const mark = cleaning ? CLEANING_MARK[cleaning] : null;
  // 過ぎた日の「未手配」は対応しようがないので消す。
  // 清掃OK・担当未確定は、過ぎた日でも記録として残す
  const showMark =
    bar.startsHere && mark && (cleaning !== 'missing' || stay.checkIn >= todayJst());
  const span = bar.end - bar.start;
  // 半日分の帯に印と人数の両方は入らない。印があるときは人数を折り返した先に回す
  const showCount = showGuestCount && (bar.startsHere ? span >= 1 || !showMark : true);

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={() => target && onSelect(target)}
      className={`
        absolute top-0 bottom-0 flex items-center gap-1 overflow-hidden
        text-[10px] font-semibold text-white leading-none pointer-events-auto
        shadow-sm
        ${bar.startsHere ? 'rounded-l-full pl-1.5' : 'pl-1'}
        ${bar.endsHere ? 'rounded-r-full pr-1.5' : 'pr-1'}
      `}
      style={{ left, width, backgroundColor: property.color }}
      title={`${property.name} ${period}${
        stay.guestCount ? ` ${stay.guestCount}名` : ' 人数未記入'
      }${mark && bar.startsHere ? ` / ${mark.label}` : ''}`}
    >
      {showMark && <span className="shrink-0 text-[9px]">{mark.icon}</span>}
      <span className="truncate">
        {/* 棟は帯の色で見分ける（凡例と日付の詳細に棟名が出る）。帯には人数だけを出す */}
        {/* 人数は、チェックインの側に入りきるならそこに出す。
            土曜に入る宿泊は週末で折り返し、最初の帯が半日分しかないので、
            折り返した先（次の週）の帯にも出す */}
        {showCount &&
          (stay.guestCount ? (
            <span className="opacity-90">{stay.guestCount}名</span>
          ) : (
            <span className="px-0.5 rounded-sm bg-white/25">未記入</span>
          ))}
      </span>
    </button>
  );
}
