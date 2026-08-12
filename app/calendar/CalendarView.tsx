'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DayActual,
  MonthlyActualTotal,
  Property,
  ReservationType,
  Schedule,
  Shift,
  UserProfile,
} from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { todayJst } from '@/app/lib/domain/datetime';
import { formatDuration, formatYen } from '@/app/lib/domain/format';
import { buildDayDetail, schedulesByDate } from '@/app/lib/domain/occupancy';
import MonthNav from '@/app/components/MonthNav';
import { ErrorBanner, Spinner } from '@/app/components/ui/Feedback';
import Button from '@/app/components/ui/Button';
import CalendarGrid from './CalendarGrid';
import DayDetail from './DayDetail';
import ScheduleForm from './ScheduleForm';

interface CalendarData {
  schedules: Schedule[];
  properties: Property[];
  shifts: Shift[];
  types: ReservationType[];
  users: UserProfile[];
  /** 日付ごとの実績（打刻の結果） */
  actuals: Record<string, DayActual[]>;
  monthlyTotal: MonthlyActualTotal;
}

interface Props {
  initialMonth: string;
  initialData: CalendarData;
  currentUserId: string;
  isAdmin: boolean;
}

export default function CalendarView({
  initialMonth,
  initialData,
  currentUserId,
  isAdmin,
}: Props) {
  const [month, setMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    todayJst()
  );
  const [data, setData] = useState<CalendarData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);

  const load = useCallback(async (targetMonth: string) => {
    setLoading(true);
    try {
      const res = await api.get<CalendarData>(
        `/api/calendar?month=${targetMonth}`
      );
      setData(res);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // 月を切り替えたら取りに行く。
  //
  // 初期表示の月だけは、すでにサーバーで取得した分があるので
  // 一度目は通信を省く。ただし戻ってきたときは取り直す。
  //
  // 以前はここで単に return していたため、他の月へ移ったあと
  // 戻ると data が移動先のままになり、予定が消えて見えた。
  // かといって initialData で復元すると、承諾済みのシフトが
  // 未回答へ巻き戻ってしまう。取り直すのが正しい。
  const visited = useRef(false);

  useEffect(() => {
    if (month === initialMonth && !visited.current) {
      visited.current = true;
      return;
    }
    visited.current = true;
    void load(month);
  }, [month, initialMonth, load]);

  // 予定は1日で完結するので、日付ごとにまとめるだけでよい
  const scheduleMap = useMemo(
    () => schedulesByDate(data.schedules, data.properties, data.types),
    [data.schedules, data.properties, data.types]
  );

  const detail = useMemo(
    () =>
      selectedDate
        ? buildDayDetail(
            selectedDate,
            data.schedules,
            data.properties,
            data.types,
            data.shifts
          )
        : null,
    [selectedDate, data]
  );

  const handleMonthChange = (m: string) => {
    setMonth(m);
    setSelectedDate(null);
  };

  // 未回答・辞退の件数（管理者向け）
  const pendingCount = data.shifts.filter(
    (s) => s.status === 'assigned'
  ).length;
  const declinedCount = data.shifts.filter(
    (s) => s.status === 'declined'
  ).length;

  return (
    <div className="space-y-4">
      <MonthNav month={month} onChange={handleMonthChange} />

      <ErrorBanner message={error} />

      {isAdmin && (pendingCount > 0 || declinedCount > 0) && (
        <div className="flex gap-2 text-xs font-semibold">
          {pendingCount > 0 && (
            <span className="px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              未回答 {pendingCount}件
            </span>
          )}
          {declinedCount > 0 && (
            <span className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200">
              辞退 {declinedCount}件
            </span>
          )}
        </div>
      )}

      {/* 今月の実績。管理者は全員分、スタッフは自分の分 */}
      {data.monthlyTotal.workMs > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAdmin ? '今月の実績（全員）' : '今月の実績'}
            </span>
            <span className="text-xl font-bold text-blue-600 tabular-nums">
              {formatYen(data.monthlyTotal.amount)}
            </span>
          </div>
          <div className="flex gap-4 mt-1 text-xs text-slate-500">
            <span>{data.monthlyTotal.days}日</span>
            <span>{formatDuration(data.monthlyTotal.workMs)}</span>
          </div>
        </div>
      )}

      {/* 種別の凡例 */}
      {data.types.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.types.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-white px-2 py-1.5 rounded-lg border border-slate-200"
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: t.color }}
              />
              {t.icon} {t.name}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <>
          <CalendarGrid
            month={month}
            scheduleMap={scheduleMap}
            shifts={data.shifts}
            users={data.users}
            actuals={data.actuals}
            onSelect={setSelectedDate}
            selectedDate={selectedDate}
          />

          {isAdmin && (
            <Button
              fullWidth
              size="md"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              ＋ 予定を追加
            </Button>
          )}

          {detail && (
            <DayDetail
              detail={detail}
              properties={data.properties}
              users={data.users}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              actuals={data.actuals[detail.date] ?? []}
              onChanged={() => load(month)}
              onEditSchedule={(sc) => {
                setEditing(sc);
                setFormOpen(true);
              }}
            />
          )}
        </>
      )}

      {formOpen && isAdmin && (
        <ScheduleForm
          // key が無いと、追加フォームを開いたあと編集を開いても
          // React が同じフォームを使い回す。初期値は useState で
          // 一度しか評価されないため、メモや人数が前のまま残る。
          // 対象が変わったら作り直させる。
          key={editing?.id ?? 'new'}
          properties={data.properties}
          types={data.types}
          users={data.users}
          schedule={editing}
          defaultDate={selectedDate ?? todayJst()}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            void load(month);
          }}
        />
      )}
    </div>
  );
}
