'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  Property,
  Reservation,
  ReservationType,
  Shift,
  UserProfile,
} from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { addDays, diffDays, formatDateJa } from '@/app/lib/domain/datetime';
import Sheet from '@/app/components/ui/Sheet';
import Button from '@/app/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/app/components/ui/Field';
import { ErrorBanner } from '@/app/components/ui/Feedback';

interface DayAssignment {
  date: string;
  userId: string;
  startTime: string;
  endTime: string;
}

/**
 * 予約フォーム。
 *
 * 予約とシフトを一度に登録する。
 * 日ごとに担当者と入り時間を指定でき、
 * 連泊の中日など不要な日は「なし」を選べる。
 */
export default function ReservationForm({
  properties,
  types,
  users,
  reservation,
  defaultDate,
  onClose,
  onSaved,
}: {
  properties: Property[];
  types: ReservationType[];
  users: UserProfile[];
  reservation: Reservation | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [propertyId, setPropertyId] = useState(
    reservation?.propertyId ?? properties[0]?.id ?? ''
  );
  const [typeId, setTypeId] = useState(
    reservation?.typeId ?? types[0]?.id ?? ''
  );
  const [guestCount, setGuestCount] = useState(
    String(reservation?.guestCount ?? 2)
  );
  const [checkIn, setCheckIn] = useState(reservation?.checkIn ?? defaultDate);
  const [checkOut, setCheckOut] = useState(
    reservation?.checkOut ?? addDays(defaultDate, 1)
  );
  const [note, setNote] = useState(reservation?.note ?? '');
  const [assignments, setAssignments] = useState<DayAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingShifts, setLoadingShifts] = useState(reservation !== null);

  const selectedType = types.find((t) => t.id === typeId);
  const hasGuests = selectedType?.hasGuests !== false;

  // 作業系は1日で完結することが多いので、終了日を開始日に合わせる
  const isSingleDay = checkOut === checkIn;
  const nights = isSingleDay ? 0 : diffDays(checkIn, checkOut);

  /**
   * シフトを指定できる日の一覧。
   *
   * 宿泊は「チェックイン日 〜 チェックアウト日」。
   * チェックアウト日も清掃で人が入るため含める。
   */
  const shiftDates = useMemo(() => {
    const dates: string[] = [];
    const last = isSingleDay ? checkIn : checkOut;
    let cursor = checkIn;
    // 上限を設けて無限ループを防ぐ
    for (let i = 0; i < 60 && cursor <= last; i++) {
      dates.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return dates;
  }, [checkIn, checkOut, isSingleDay]);

  // 既存予約を編集するときは、割当済みのシフトを読み込む
  useEffect(() => {
    if (!reservation) return;

    void (async () => {
      try {
        const data = await api.get<{ shifts: Shift[] }>(
          `/api/reservations/${reservation.id}`
        );
        setAssignments(
          data.shifts.map((s) => ({
            date: s.shiftDate,
            userId: s.userId,
            startTime: s.startTime ?? '',
            endTime: s.endTime ?? '',
          }))
        );
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoadingShifts(false);
      }
    })();
  }, [reservation]);

  const assignmentFor = (date: string) =>
    assignments.find((a) => a.date === date);

  const setAssignment = (date: string, patch: Partial<DayAssignment>) => {
    setAssignments((prev) => {
      const existing = prev.find((a) => a.date === date);
      if (existing) {
        return prev.map((a) => (a.date === date ? { ...a, ...patch } : a));
      }
      return [
        ...prev,
        { date, userId: '', startTime: '10:00', endTime: '', ...patch },
      ];
    });
  };

  const handleCheckInChange = (value: string) => {
    setCheckIn(value);
    if (checkOut < value) {
      setCheckOut(hasGuests ? addDays(value, 1) : value);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (checkOut < checkIn) {
      setError('終了日は開始日以降にしてください');
      return;
    }

    setSaving(true);

    // 担当者が選ばれている日だけ送る
    const shifts = shiftDates
      .map((date) => assignmentFor(date))
      .filter((a): a is DayAssignment => Boolean(a?.userId))
      .map((a) => ({
        date: a.date,
        userId: a.userId,
        startTime: a.startTime || null,
        endTime: a.endTime || null,
      }));

    const payload = {
      propertyId,
      typeId,
      guestCount: hasGuests ? Number(guestCount) : 0,
      checkIn,
      checkOut,
      note: note || null,
      shifts,
    };

    try {
      if (reservation) {
        await api.patch(`/api/reservations/${reservation.id}`, payload);
      } else {
        await api.post('/api/reservations', payload);
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!reservation) return;
    if (!window.confirm('この予定を削除しますか？シフトも一緒に消えます。'))
      return;

    setSaving(true);
    try {
      await api.delete(`/api/reservations/${reservation.id}`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={reservation ? '予定を編集' : '予定を追加'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {reservation && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              削除
            </Button>
          )}
          <Button
            type="submit"
            form="reservation-form"
            fullWidth
            size="lg"
            loading={saving}
          >
            保存する
          </Button>
        </div>
      }
    >
      <form id="reservation-form" onSubmit={submit} className="space-y-4">
        <ErrorBanner message={error} />

        {/* 種別 */}
        <Field label="種別" required>
          <div className="grid grid-cols-2 gap-2">
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTypeId(t.id);
                  // 作業系に切り替えたら1日で完結させる
                  if (t.hasGuests === false && checkOut !== checkIn) {
                    setCheckOut(checkIn);
                  }
                  if (t.hasGuests !== false && checkOut === checkIn) {
                    setCheckOut(addDays(checkIn, 1));
                  }
                }}
                className={`px-3 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                  typeId === t.id
                    ? 'text-white border-transparent'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
                style={
                  typeId === t.id ? { backgroundColor: t.color } : undefined
                }
              >
                {t.icon} {t.name}
              </button>
            ))}
          </div>
        </Field>

        <Field label="棟" required>
          <Select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            required
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={hasGuests ? 'チェックイン' : '開始日'} required>
            <Input
              type="date"
              value={checkIn}
              onChange={(e) => handleCheckInChange(e.target.value)}
              required
            />
          </Field>
          <Field label={hasGuests ? 'チェックアウト' : '終了日'} required>
            <Input
              type="date"
              value={checkOut}
              min={checkIn}
              onChange={(e) => setCheckOut(e.target.value)}
              required
            />
          </Field>
        </div>

        {nights > 0 && (
          <p className="text-sm text-blue-600 font-semibold -mt-1">
            {nights}泊
          </p>
        )}

        {hasGuests && (
          <Field label="宿泊人数" required>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              required
            />
          </Field>
        )}

        {/* 日ごとのシフト割当 */}
        <div className="pt-2 border-t border-slate-200">
          <p className="text-sm font-semibold text-slate-700 mb-1">
            担当スタッフと入り時間
          </p>
          <p className="text-xs text-slate-500 mb-3">
            人が入らない日は「なし」のままにしてください
          </p>

          {loadingShifts ? (
            <p className="text-sm text-slate-400">読み込み中...</p>
          ) : (
            <ul className="space-y-2">
              {shiftDates.map((date) => {
                const a = assignmentFor(date);
                return (
                  <li
                    key={date}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <p className="text-xs font-bold text-slate-600 mb-1.5">
                      {formatDateJa(date)}
                      {date === checkIn && hasGuests && nights > 0 && (
                        <span className="ml-1.5 text-emerald-600">IN</span>
                      )}
                      {date === checkOut && hasGuests && nights > 0 && (
                        <span className="ml-1.5 text-blue-600">OUT</span>
                      )}
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={a?.userId ?? ''}
                        onChange={(e) =>
                          setAssignment(date, { userId: e.target.value })
                        }
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                      >
                        <option value="">なし</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.email}
                          </option>
                        ))}
                      </select>

                      <input
                        type="time"
                        value={a?.startTime ?? ''}
                        disabled={!a?.userId}
                        onChange={(e) =>
                          setAssignment(date, { startTime: e.target.value })
                        }
                        placeholder="入り時間"
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Field label="メモ" hint="作業内容や注意点など">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </Field>
      </form>
    </Sheet>
  );
}
