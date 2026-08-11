'use client';

import { useState } from 'react';
import type { Property, Reservation } from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { addDays, diffDays } from '@/app/lib/domain/datetime';
import Sheet from '@/app/components/ui/Sheet';
import Button from '@/app/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/app/components/ui/Field';
import { ErrorBanner } from '@/app/components/ui/Feedback';

export default function ReservationForm({
  properties,
  reservation,
  defaultDate,
  onClose,
  onSaved,
}: {
  properties: Property[];
  reservation: Reservation | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [propertyId, setPropertyId] = useState(
    reservation?.propertyId ?? properties[0]?.id ?? ''
  );
  const [guestName, setGuestName] = useState(reservation?.guestName ?? '');
  const [guestCount, setGuestCount] = useState(
    String(reservation?.guestCount ?? 2)
  );
  const [checkIn, setCheckIn] = useState(reservation?.checkIn ?? defaultDate);
  const [checkOut, setCheckOut] = useState(
    reservation?.checkOut ?? addDays(defaultDate, 1)
  );
  const [checkInTime, setCheckInTime] = useState(
    reservation?.checkInTime?.slice(0, 5) ?? ''
  );
  const [checkOutTime, setCheckOutTime] = useState(
    reservation?.checkOutTime?.slice(0, 5) ?? ''
  );
  const [source, setSource] = useState(reservation?.source ?? '');
  const [contact, setContact] = useState(reservation?.contact ?? '');
  const [note, setNote] = useState(reservation?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nights = checkOut > checkIn ? diffDays(checkIn, checkOut) : 0;

  // チェックイン日を変えたらチェックアウトも追随させる
  const handleCheckInChange = (value: string) => {
    setCheckIn(value);
    if (checkOut <= value) {
      setCheckOut(addDays(value, 1));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (nights < 1) {
      setError('チェックアウト日はチェックイン日より後にしてください');
      return;
    }

    setSaving(true);

    const payload = {
      propertyId,
      guestName,
      guestCount: Number(guestCount),
      checkIn,
      checkOut,
      checkInTime: checkInTime || null,
      checkOutTime: checkOutTime || null,
      source: source || null,
      contact: contact || null,
      note: note || null,
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
    if (!window.confirm('この予約を削除しますか？')) return;

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
      title={reservation ? '予約を編集' : '予約を追加'}
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
          <Field label="チェックイン" required>
            <Input
              type="date"
              value={checkIn}
              onChange={(e) => handleCheckInChange(e.target.value)}
              required
            />
          </Field>
          <Field label="チェックアウト" required>
            <Input
              type="date"
              value={checkOut}
              min={addDays(checkIn, 1)}
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="人数" required>
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
          <Field label="予約者名">
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="山田様"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="IN時刻" hint="任意">
            <Input
              type="time"
              value={checkInTime}
              onChange={(e) => setCheckInTime(e.target.value)}
            />
          </Field>
          <Field label="OUT時刻" hint="任意">
            <Input
              type="time"
              value={checkOutTime}
              onChange={(e) => setCheckOutTime(e.target.value)}
            />
          </Field>
        </div>

        <Field label="予約経路" hint="Airbnb / Booking.com など">
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Airbnb"
          />
        </Field>

        <Field label="連絡先">
          <Input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="090-0000-0000"
          />
        </Field>

        <Field label="メモ" hint="アレルギー、到着遅延、特記事項など">
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
