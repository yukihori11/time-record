'use client';

import { useEffect, useState } from 'react';
import type {
  Property,
  ReservationType,
  Schedule,
  Shift,
  UserProfile,
} from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { formatDateJa } from '@/app/lib/domain/datetime';
import Sheet from '@/app/components/ui/Sheet';
import Button from '@/app/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/app/components/ui/Field';
import { ErrorBanner } from '@/app/components/ui/Feedback';

interface Assignment {
  userId: string;
  startTime: string;
  endTime: string;
}

/**
 * 予定フォーム。
 *
 * 予定は1日で完結するため、日付は1つだけ。
 * 同じ画面で担当スタッフと入り時間も指定する。
 */
export default function ScheduleForm({
  properties,
  types,
  users,
  schedule,
  defaultDate,
  onClose,
  onSaved,
}: {
  properties: Property[];
  types: ReservationType[];
  users: UserProfile[];
  schedule: Schedule | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [propertyId, setPropertyId] = useState(
    schedule?.propertyId ?? properties[0]?.id ?? ''
  );
  const [typeId, setTypeId] = useState(schedule?.typeId ?? types[0]?.id ?? '');
  const [guestCount, setGuestCount] = useState(
    String(schedule?.guestCount ?? 2)
  );
  const [scheduleDate, setScheduleDate] = useState(
    schedule?.scheduleDate ?? defaultDate
  );
  const [note, setNote] = useState(schedule?.note ?? '');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingShifts, setLoadingShifts] = useState(schedule !== null);

  const selectedType = types.find((t) => t.id === typeId);
  const hasGuests = selectedType?.hasGuests !== false;

  // 編集時は割当済みの担当者を読み込む
  useEffect(() => {
    if (!schedule) return;

    void (async () => {
      try {
        const data = await api.get<{ shifts: Shift[] }>(
          `/api/reservations/${schedule.id}`
        );
        setAssignments(
          data.shifts.map((s) => ({
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
  }, [schedule]);

  const addAssignment = () => {
    setAssignments((prev) => [
      ...prev,
      { userId: '', startTime: '10:00', endTime: '' },
    ]);
  };

  const updateAssignment = (index: number, patch: Partial<Assignment>) => {
    setAssignments((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...patch } : a))
    );
  };

  const removeAssignment = (index: number) => {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      propertyId,
      typeId,
      scheduleDate,
      guestCount: hasGuests ? Number(guestCount) : 0,
      note: note || null,
      shifts: assignments.filter((a) => a.userId),
    };

    try {
      if (schedule) {
        await api.patch(`/api/reservations/${schedule.id}`, payload);
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
    if (!schedule) return;
    if (!window.confirm('この予定を削除しますか？シフトも一緒に消えます。'))
      return;

    setSaving(true);
    try {
      await api.delete(`/api/reservations/${schedule.id}`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  // 同じ人を二重に選べないようにする
  const usedIds = new Set(assignments.map((a) => a.userId).filter(Boolean));

  return (
    <Sheet
      title={schedule ? '予定を編集' : '予定を追加'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {schedule && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              削除
            </Button>
          )}
          <Button
            type="submit"
            form="schedule-form"
            fullWidth
            size="lg"
            loading={saving}
          >
            保存する
          </Button>
        </div>
      }
    >
      <form id="schedule-form" onSubmit={submit} className="space-y-4">
        <ErrorBanner message={error} />

        <Field label="日付" required>
          <Input
            type="date"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            required
          />
          {scheduleDate && (
            <p className="text-xs text-blue-600 font-semibold mt-1.5">
              {formatDateJa(scheduleDate)}
            </p>
          )}
        </Field>

        <Field label="種別" required>
          <div className="grid grid-cols-2 gap-2">
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeId(t.id)}
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

        {hasGuests && (
          <Field label="人数" hint="お客さんの人数">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
            />
          </Field>
        )}

        {/* 担当スタッフ */}
        <div className="pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-slate-700">
              担当スタッフと入り時間
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={addAssignment}
            >
              ＋ 追加
            </Button>
          </div>

          {loadingShifts ? (
            <p className="text-sm text-slate-400 mt-2">読み込み中...</p>
          ) : assignments.length === 0 ? (
            <p className="text-xs text-slate-500 mt-2">
              担当者が不要な予定なら、このままで構いません
            </p>
          ) : (
            <ul className="space-y-2 mt-2">
              {assignments.map((a, index) => (
                <li
                  key={index}
                  className="p-2.5 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                    <select
                      value={a.userId}
                      onChange={(e) =>
                        updateAssignment(index, { userId: e.target.value })
                      }
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                    >
                      <option value="">選択してください</option>
                      {users
                        .filter((u) => u.id === a.userId || !usedIds.has(u.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.email}
                          </option>
                        ))}
                    </select>

                    <input
                      type="time"
                      value={a.startTime}
                      onChange={(e) =>
                        updateAssignment(index, { startTime: e.target.value })
                      }
                      className="px-2 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                    />

                    <button
                      type="button"
                      onClick={() => removeAssignment(index)}
                      className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 text-lg"
                      aria-label="削除"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
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
