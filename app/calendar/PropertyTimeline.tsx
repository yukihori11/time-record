'use client';

import { useEffect, useRef } from 'react';
import type { Property, Shift, Stay } from '@/app/types/domain';
import type { ScheduleEntry } from '@/app/lib/domain/occupancy';
import type { CleaningStatus, StayBar } from '@/app/lib/domain/stays';
import { checkInsByDate, rangeStayBars, stayNights } from '@/app/lib/domain/stays';
import { dayOfWeek, monthDays, todayJst } from '@/app/lib/domain/datetime';
import { CLEANING_BADGE } from '@/app/components/StayBadges';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 1日分の列の幅（px）。1泊の帯でも人数が読める幅にする */
const COL = 42;
/** 棟名の列の幅（px） */
const NAME_W = 96;
/** 棟1行の高さ（px）。棟が何十あってもこの高さは変えない */
const ROW_H = 46;

/**
 * 管理者向けの「棟ごとのタイムライン」。行＝棟、列＝日付。
 *
 * 月のカレンダーは全棟の帯を1マスに積むため、棟が増えるほど
 * 1段が細くなり読めなくなる。こちらは棟が増えても行が増えるだけで、
 * 1行の高さは変わらない。棟名は左の列に出すので、帯に名前を
 * 入れる必要がなく、1泊の帯でも見切れない。
 *
 * 下に「清掃」「スタッフ」の集計行を置き、民泊の状況と
 * スタッフの手配を同じ画面で追えるようにする。
 */
export default function PropertyTimeline({
  month,
  properties,
  stays,
  cleaning,
  scheduleMap,
  shifts,
  onSelect,
  selectedDate,
}: {
  month: string;
  properties: Property[];
  stays: Stay[];
  cleaning: Map<string, CleaningStatus>;
  scheduleMap: Map<string, ScheduleEntry[]>;
  shifts: Shift[];
  onSelect: (date: string) => void;
  selectedDate: string | null;
}) {
  const today = todayJst();
  const days = monthDays(month);
  const bars = rangeStayBars(days[0], days.length, stays);
  const checkIns = checkInsByDate(stays);
  const todayIndex = days.indexOf(today);
  const selectedIndex = selectedDate ? days.indexOf(selectedDate) : -1;
  const trackWidth = days.length * COL;
  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  // 清掃の行は、同じ日に一番多くチェックインがある日に合わせて高さを決める
  const maxCheckIns = Math.max(
    1,
    ...days.map((d) => (checkIns.get(d) ?? []).length)
  );
  // 丸は1列に2つずつ並べる
  const cleaningRowHeight = Math.ceil(maxCheckIns / 2) * 20 + 12;

  // 今日が見えるように横に送る。前日を少し見せる
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = todayIndex > 0 ? (todayIndex - 1) * COL : 0;
  }, [month, todayIndex]);

  /** 行の中で押された位置から日付を求める */
  const selectAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const index = Math.floor((e.clientX - rect.left) / COL);
    if (index >= 0 && index < days.length) onSelect(days[index]);
  };

  // 日付ごとのスタッフの手配状況
  const shiftsByDay = new Map<string, Shift[]>();
  for (const s of shifts) {
    const list = shiftsByDay.get(s.shiftDate);
    if (list) list.push(s);
    else shiftsByDay.set(s.shiftDate, [s]);
  }

  /** 今日・選択中の列を、行をまたいで色付けする */
  const columnMarks = (
    <>
      {todayIndex >= 0 && (
        <div
          className="absolute top-0 bottom-0 bg-blue-50/70 pointer-events-none"
          style={{ left: todayIndex * COL, width: COL }}
        />
      )}
      {selectedIndex >= 0 && (
        <div
          className="absolute top-0 bottom-0 bg-blue-100/60 border-x-2 border-blue-400 pointer-events-none"
          style={{ left: selectedIndex * COL, width: COL }}
        />
      )}
    </>
  );

  /** 1日ごとの縦の区切り線 */
  const gridLines = {
    backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${COL - 1}px, #f1f5f9 ${COL - 1}px ${COL}px)`,
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div ref={scroller} className="overflow-auto max-h-[72vh] overscroll-x-contain">
        <div style={{ width: NAME_W + trackWidth }}>
          {/* 日付の見出し。縦にスクロールしても残す */}
          <div className="flex sticky top-0 z-30 bg-white border-b border-slate-200">
            <div
              className="sticky left-0 z-10 bg-white border-r border-slate-200 flex items-end px-2 pb-1.5 text-[10px] font-semibold text-slate-400"
              style={{ width: NAME_W, minWidth: NAME_W }}
            >
              棟 ＼ 日付
            </div>
            {days.map((date, i) => {
              const dow = dayOfWeek(date);
              const isToday = i === todayIndex;
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={date}
                  onClick={() => onSelect(date)}
                  className={`shrink-0 flex flex-col items-center justify-center py-1.5 ${
                    isSelected ? 'bg-blue-100' : dow === 0 || dow === 6 ? 'bg-slate-50' : ''
                  }`}
                  style={{ width: COL }}
                  aria-label={`${Number(date.slice(5, 7))}月${Number(date.slice(-2))}日`}
                  aria-pressed={isSelected}
                >
                  <span
                    className={`text-[10px] font-semibold ${
                      dow === 0 ? 'text-rose-500' : dow === 6 ? 'text-sky-600' : 'text-slate-400'
                    }`}
                  >
                    {WEEKDAYS[dow]}
                  </span>
                  <span
                    className={`mt-0.5 inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                      isToday
                        ? 'bg-blue-600 text-white'
                        : date < today
                          ? 'text-slate-400'
                          : 'text-slate-800'
                    }`}
                  >
                    {Number(date.slice(-2))}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 棟ごとの行 */}
          {properties.map((p) => (
            <div key={p.id} className="flex border-b border-slate-100">
              <div
                className="sticky left-0 z-20 bg-white border-r border-slate-200 flex items-center gap-1.5 px-2"
                style={{ width: NAME_W, minWidth: NAME_W, height: ROW_H }}
                title={p.name}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-xs font-bold text-slate-700 leading-tight line-clamp-2 break-all">
                  {p.name}
                </span>
              </div>

              <div
                className="relative cursor-pointer"
                style={{ width: trackWidth, height: ROW_H, ...gridLines }}
                onClick={selectAt}
              >
                {columnMarks}

                {/* この棟のその日の予定（清掃など）。帯の下にアイコンで出す */}
                {days.map((date, i) => {
                  const entries = (scheduleMap.get(date) ?? []).filter(
                    (e) => e.schedule.propertyId === p.id
                  );
                  if (entries.length === 0) return null;
                  return (
                    <div
                      key={date}
                      className="absolute bottom-0.5 flex justify-center gap-px text-[11px] leading-none pointer-events-none"
                      style={{ left: i * COL, width: COL }}
                      title={entries.map((e) => e.type?.name ?? '').join('・')}
                    >
                      {entries.slice(0, 2).map((e) => (
                        <span key={e.schedule.id}>{e.type?.icon ?? '•'}</span>
                      ))}
                    </div>
                  );
                })}

                {(bars.get(p.id) ?? []).map((bar) => (
                  <TimelineBar
                    key={bar.stay.id}
                    bar={bar}
                    color={p.color}
                    propertyName={p.name}
                    cleaning={cleaning.get(bar.stay.id)}
                    month={month}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* 集計：清掃（チェックインのある日）*/}
          <SummaryRow
            label="🧹 清掃"
            hint="チェックインのある棟を棟の色の丸で表示。外側の輪は手配状況（赤＝未手配・黄＝担当未確定・緑＝OK）"
            gridLines={gridLines}
            trackWidth={trackWidth}
            marks={columnMarks}
            height={cleaningRowHeight}
          >
            {days.map((date, i) => {
              const list = checkIns.get(date) ?? [];
              if (list.length === 0) return null;
              const isPastDay = date < today;
              return (
                <button
                  key={date}
                  onClick={() => onSelect(date)}
                  className="absolute top-1.5 flex flex-wrap justify-center content-start gap-x-1.5 gap-y-2 px-1 pt-0.5"
                  style={{ left: i * COL, width: COL }}
                >
                  {list.map((st) => {
                    const p = propertyMap.get(st.propertyId);
                    const status = cleaning.get(st.id);
                    // 丸＝棟の色（左の棟名と同じ）。外側の輪＝手配状況
                    const ring = isPastDay
                      ? 'ring-transparent opacity-40'
                      : status === 'ready'
                        ? 'ring-emerald-500'
                        : status === 'unassigned'
                          ? 'ring-amber-400'
                          : 'ring-red-500';
                    const label = isPastDay
                      ? '過ぎた日'
                      : CLEANING_BADGE[status ?? 'missing'].label;
                    return (
                      <span
                        key={st.id}
                        className={`block w-3 h-3 rounded-full ring-2 ring-offset-1 ${ring}`}
                        style={{ backgroundColor: p?.color ?? '#94a3b8' }}
                        title={`${p?.name ?? '棟不明'}：${label}`}
                      />
                    );
                  })}
                </button>
              );
            })}
          </SummaryRow>

          {/* 集計：スタッフ（その日に入る人数と回答状況） */}
          <SummaryRow label="👤 スタッフ" hint="入る人数（承諾／全体）" gridLines={gridLines} trackWidth={trackWidth} marks={columnMarks}>
            {days.map((date, i) => {
              const list = shiftsByDay.get(date) ?? [];
              if (list.length === 0) return null;
              const accepted = list.filter((s) => s.status === 'accepted').length;
              const hasDeclined = list.some((s) => s.status === 'declined');
              const tone = hasDeclined
                ? 'bg-red-100 text-red-700'
                : accepted < list.length
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800';
              return (
                <button
                  key={date}
                  onClick={() => onSelect(date)}
                  className="absolute top-1/2 -translate-y-1/2 flex justify-center"
                  style={{ left: i * COL, width: COL }}
                  title={`承諾 ${accepted}人 / 全体 ${list.length}人${hasDeclined ? '（辞退あり）' : ''}`}
                >
                  <span className={`px-1 rounded text-[10px] font-bold tabular-nums ${tone}`}>
                    {accepted}/{list.length}
                  </span>
                </button>
              );
            })}
          </SummaryRow>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  hint,
  gridLines,
  trackWidth,
  marks,
  height = 36,
  children,
}: {
  label: string;
  hint: string;
  gridLines: React.CSSProperties;
  trackWidth: number;
  marks: React.ReactNode;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex border-t border-slate-200 bg-slate-50/60">
      <div
        className="sticky left-0 z-20 bg-slate-50 border-r border-slate-200 flex flex-col justify-center px-2"
        style={{ width: NAME_W, minWidth: NAME_W, height }}
        title={hint}
      >
        <span className="text-[11px] font-bold text-slate-600">{label}</span>
      </div>
      <div className="relative" style={{ width: trackWidth, height, ...gridLines }}>
        {marks}
        {children}
      </div>
    </div>
  );
}

function TimelineBar({
  bar,
  color,
  propertyName,
  cleaning,
  month,
  onSelect,
}: {
  bar: StayBar;
  color: string;
  propertyName: string;
  cleaning: CleaningStatus | undefined;
  month: string;
  onSelect: (date: string) => void;
}) {
  const { stay } = bar;
  const left = bar.start * COL + 1;
  const width = (bar.end - bar.start) * COL - 2;
  const period = `${stay.checkIn}〜${stay.checkOut}（${stayNights(stay)}泊）`;

  if (stay.kind === 'blocked') {
    return (
      <div
        className="absolute top-1.5 h-6 rounded-md flex items-center px-1.5 overflow-hidden text-[10px] font-semibold text-slate-500 pointer-events-none"
        style={{
          left,
          width,
          backgroundImage: 'repeating-linear-gradient(135deg, #e2e8f0 0 4px, #f8fafc 4px 8px)',
        }}
        title={`${propertyName} ブロック（Airbnb で売り止め） ${period}`}
      >
        {width > 60 && <span className="truncate">ブロック</span>}
      </div>
    );
  }

  const mark = cleaning ? CLEANING_BADGE[cleaning] : null;
  // 印はチェックイン（＝清掃の日）がまだ来ていない宿泊にだけ出す。
  // 過ぎた日の「未手配」は対応しようがないので消す。
  // 手配が済んでいれば ✅ を出し、スタッフが決まっていることも分かるようにする
  const showMark = bar.startsHere && mark && stay.checkIn >= todayJst();
  const target = bar.startsHere ? stay.checkIn : null;
  const selectable = target !== null && target.startsWith(month);

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={(e) => {
        e.stopPropagation();
        if (target) onSelect(target);
      }}
      className={`
        absolute top-1.5 h-6 flex items-center gap-0.5 overflow-hidden
        text-[11px] font-bold text-white leading-none shadow-sm z-[1]
        ${bar.startsHere ? 'rounded-l-full pl-1.5' : 'pl-1'}
        ${bar.endsHere ? 'rounded-r-full pr-1.5' : 'pr-1'}
      `}
      style={{ left, width, backgroundColor: color }}
      title={`${propertyName} ${period}${
        stay.guestCount ? ` ${stay.guestCount}名` : ' 人数未記入'
      }${mark && bar.startsHere ? ` / ${mark.label}` : ''}`}
    >
      {showMark && <span className="shrink-0 text-[9px]">{mark.icon}</span>}
      <span className="truncate tabular-nums">
        {stay.guestCount ? `${stay.guestCount}名` : <span className="opacity-80">未記入</span>}
        {/* 幅に余裕があれば泊数も出す */}
        {width > 90 && <span className="ml-1 opacity-80 font-semibold">{stayNights(stay)}泊</span>}
      </span>
    </button>
  );
}
