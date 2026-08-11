'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Property,
  Reservation,
  Shift,
  UserProfile,
} from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { monthDays, todayJst } from '@/app/lib/domain/datetime';
import { buildOccupancy } from '@/app/lib/domain/occupancy';
import { useAuth } from '@/app/contexts/AuthContext';
import MonthNav from '@/app/components/MonthNav';
import { ErrorBanner, Spinner } from '@/app/components/ui/Feedback';
import Button from '@/app/components/ui/Button';
import CalendarGrid from './CalendarGrid';
import DayDetail from './DayDetail';
import ReservationForm from './ReservationForm';

export default function CalendarView() {
  const { user, isAdmin } = useAuth();
  const [month, setMonth] = useState(() => todayJst().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    todayJst()
  );
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);

  // 4本のAPIを叩くとその回数だけ認証が走るため、1本にまとめている
  const load = useCallback(async (targetMonth: string) => {
    setLoading(true);
    try {
      const data = await api.get<{
        reservations: Reservation[];
        properties: Property[];
        shifts: Shift[];
        users: UserProfile[];
      }>(`/api/calendar?month=${targetMonth}`);

      setReservations(data.reservations);
      setProperties(data.properties);
      setShifts(data.shifts);
      setUsers(data.users);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

  const days = useMemo(
    () => buildOccupancy(monthDays(month), reservations, properties, shifts),
    [month, reservations, properties, shifts]
  );

  const selectedDay = days.find((d) => d.date === selectedDate) ?? null;

  const handleMonthChange = (m: string) => {
    setMonth(m);
    setSelectedDate(null);
  };

  return (
    <div className="space-y-4">
      <MonthNav month={month} onChange={handleMonthChange} />

      <ErrorBanner message={error} />

      {/* 棟の凡例 */}
      {properties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {properties.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200"
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
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
            days={days}
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
              ＋ 予約を追加
            </Button>
          )}

          {selectedDay && user && (
            <DayDetail
              day={selectedDay}
              reservations={reservations}
              properties={properties}
              users={users}
              currentUserId={user.id}
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
          properties={properties}
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
