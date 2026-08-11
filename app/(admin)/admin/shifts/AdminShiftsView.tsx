'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Property, Shift, UserProfile } from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { formatDateJa, monthDays, todayJst } from '@/app/lib/domain/datetime';
import MonthNav from '@/app/components/MonthNav';
import Button from '@/app/components/ui/Button';
import Sheet from '@/app/components/ui/Sheet';
import { Field, Input, Select, Textarea } from '@/app/components/ui/Field';
import {
  Card,
  EmptyState,
  ErrorBanner,
  Spinner,
} from '@/app/components/ui/Feedback';

export default function AdminShiftsView() {
  const [month, setMonth] = useState(() => todayJst().slice(0, 7));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async (targetMonth: string) => {
    setLoading(true);
    try {
      const [shiftRes, userRes, propRes] = await Promise.all([
        api.get<{ shifts: Shift[] }>(`/api/shifts?month=${targetMonth}`),
        api.get<{ users: UserProfile[] }>('/api/users'),
        api.get<{ properties: Property[] }>('/api/properties'),
      ]);
      setShifts(shiftRes.shifts);
      setUsers(userRes.users.filter((u) => u.isActive));
      setProperties(propRes.properties);
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

  const remove = async (id: string) => {
    if (!window.confirm('このシフトを取り消しますか？')) return;
    try {
      await api.delete(`/api/shifts/${id}`);
      await load(month);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const userMap = new Map(users.map((u) => [u.id, u]));
  const propertyMap = new Map(properties.map((p) => [p.id, p]));

  // 日付ごとにまとめる
  const byDate = new Map<string, Shift[]>();
  for (const s of shifts) {
    const list = byDate.get(s.shiftDate);
    if (list) list.push(s);
    else byDate.set(s.shiftDate, [s]);
  }

  return (
    <div className="space-y-4">
      <MonthNav month={month} onChange={setMonth} />

      <ErrorBanner message={error} />

      <Button fullWidth onClick={() => setFormOpen(true)}>
        ＋ シフトを割り当てる
      </Button>

      {loading ? (
        <Spinner />
      ) : shifts.length === 0 ? (
        <EmptyState
          icon="📋"
          title="この月のシフトはありません"
          description="上のボタンから割り当ててください"
        />
      ) : (
        <div className="space-y-3">
          {Array.from(byDate.keys())
            .sort()
            .map((date) => (
              <Card key={date} className="p-4">
                <h3 className="font-bold text-slate-900 mb-2">
                  {formatDateJa(date)}
                </h3>
                <ul className="space-y-1.5">
                  {byDate.get(date)!.map((shift) => {
                    const property = shift.propertyId
                      ? propertyMap.get(shift.propertyId)
                      : null;

                    return (
                      <li
                        key={shift.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {userMap.get(shift.userId)?.name ||
                              userMap.get(shift.userId)?.email ||
                              'スタッフ'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {property && (
                              <span
                                className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                                style={{ backgroundColor: property.color }}
                              />
                            )}
                            {property?.name ?? '棟未指定'}
                            {shift.startTime && ` / ${shift.startTime}`}
                            {shift.endTime && `〜${shift.endTime}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={shift.status} />
                          <button
                            onClick={() => remove(shift.id)}
                            className="text-xs text-red-500 font-semibold px-1.5"
                          >
                            取消
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
        </div>
      )}

      {formOpen && (
        <AssignForm
          month={month}
          users={users}
          properties={properties}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void load(month);
          }}
        />
      )}
    </div>
  );
}

function AssignForm({
  month,
  users,
  properties,
  onClose,
  onSaved,
}: {
  month: string;
  users: UserProfile[];
  properties: Property[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState(users[0]?.id ?? '');
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('15:00');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const days = monthDays(month);
  const today = todayJst();

  const toggleDate = (date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedDates.length === 0) {
      setError('日付を選択してください');
      return;
    }

    setSaving(true);

    try {
      await api.post('/api/shifts', {
        userId,
        propertyId: propertyId || null,
        dates: selectedDates,
        startTime: startTime || null,
        endTime: endTime || null,
        note: note || null,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="シフトを割り当てる"
      onClose={onClose}
      footer={
        <Button
          type="submit"
          form="assign-form"
          fullWidth
          size="lg"
          loading={saving}
        >
          {selectedDates.length > 0
            ? `${selectedDates.length}日分を割り当てる`
            : '割り当てる'}
        </Button>
      }
    >
      <form id="assign-form" onSubmit={submit} className="space-y-4">
        <ErrorBanner message={error} />

        <Field label="スタッフ" required>
          <Select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="担当する棟">
          <Select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            <option value="">指定なし</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="開始時刻">
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="終了時刻">
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">
            日付（複数選択できます）
          </p>
          <div className="grid grid-cols-7 gap-1">
            {days.map((date) => {
              const selected = selectedDates.includes(date);
              const isToday = date === today;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => toggleDate(date)}
                  className={`aspect-square rounded-lg text-sm font-semibold transition-colors ${
                    selected
                      ? 'bg-blue-600 text-white'
                      : isToday
                        ? 'bg-blue-50 text-blue-600 border border-blue-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {Number(date.slice(-2))}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="メモ">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="チェックイン対応をお願いします"
            rows={2}
          />
        </Field>
      </form>
    </Sheet>
  );
}

function StatusBadge({ status }: { status: Shift['status'] }) {
  const style = {
    assigned: 'bg-amber-100 text-amber-700',
    accepted: 'bg-emerald-100 text-emerald-700',
    declined: 'bg-red-100 text-red-600',
  }[status];

  const label = { assigned: '未回答', accepted: '承諾', declined: '辞退' }[
    status
  ];

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-bold ${style}`}>
      {label}
    </span>
  );
}
