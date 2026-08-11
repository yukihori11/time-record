'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Property,
  Reservation,
  ReservationType,
  Shift,
  UserProfile,
} from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { todayJst } from '@/app/lib/domain/datetime';
import { buildDayDetail, buildWeeks } from '@/app/lib/domain/occupancy';
import MonthNav from '@/app/components/MonthNav';
import { ErrorBanner, Spinner } from '@/app/components/ui/Feedback';
import Button from '@/app/components/ui/Button';
import CalendarGrid from './CalendarGrid';
import DayDetail from './DayDetail';
import ReservationForm from './ReservationForm';

interface CalendarData {
  reservations: Reservation[];
  properties: Property[];
  shifts: Shift[];
  types: ReservationType[];
  users: UserProfile[];
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
  const [editing, setEditing] = useState<Reservation | null>(null);

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

  // 初期表示はサーバー取得済み。月を切り替えたときだけ取りに行く
  useEffect(() => {
    if (month === initialMonth) return;
    void load(month);
  }, [month, initialMonth, load]);

  // 連泊を日付またぎの帯にするため、週単位に組み直す
  const weeks = useMemo(
    () => buildWeeks(month, data.reservations, data.properties, data.types),
    [month, data.reservations, data.properties, data.types]
  );

  const detail = useMemo(
    () =>
      selectedDate
        ? buildDayDetail(
            selectedDate,
            data.reservations,
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
            weeks={weeks}
            shifts={data.shifts}
            users={data.users}
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
              onChanged={() => load(month)}
              onEditReservation={(r) => {
                setEditing(r);
                setFormOpen(true);
              }}
            />
          )}
        </>
      )}

      {formOpen && isAdmin && (
        <ReservationForm
          properties={data.properties}
          types={data.types}
          users={data.users}
          reservation={editing}
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
