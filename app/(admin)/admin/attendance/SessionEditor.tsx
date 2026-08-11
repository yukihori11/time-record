'use client';

import { useState } from 'react';
import type { Property, UserProfile, WorkSession } from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { todayJst } from '@/app/lib/domain/datetime';
import Sheet from '@/app/components/ui/Sheet';
import Button from '@/app/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/app/components/ui/Field';
import { ErrorBanner } from '@/app/components/ui/Feedback';

/** Date → datetime-local 入力用の 'YYYY-MM-DDTHH:MM'（JST） */
function toLocalInput(date: Date | null): string {
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return parts.replace(' ', 'T');
}

/** 'YYYY-MM-DDTHH:MM'（JST）→ ISO文字列 */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  // JST(+09:00)として解釈する
  return new Date(`${value}:00+09:00`).toISOString();
}

export default function SessionEditor({
  session,
  users,
  properties,
  onClose,
  onSaved,
}: {
  session: WorkSession | null;
  users: UserProfile[];
  properties: Property[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = session === null;

  const [userId, setUserId] = useState(session?.userId ?? users[0]?.id ?? '');
  const [propertyId, setPropertyId] = useState(session?.propertyId ?? '');
  const [clockIn, setClockIn] = useState(
    session ? toLocalInput(session.clockIn) : `${todayJst()}T09:00`
  );
  const [clockOut, setClockOut] = useState(
    session ? toLocalInput(session.clockOut) : ''
  );
  const [editReason, setEditReason] = useState('');
  const [breaks, setBreaks] = useState(
    session?.breaks.map((b) => ({
      id: b.id,
      start: toLocalInput(b.breakStart),
      end: toLocalInput(b.breakEnd),
    })) ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!editReason.trim()) {
      setError('修正の理由を入力してください');
      return;
    }

    setSaving(true);

    try {
      if (isNew) {
        await api.post('/api/admin/sessions', {
          userId,
          propertyId: propertyId || null,
          clockIn: fromLocalInput(clockIn),
          clockOut: fromLocalInput(clockOut),
          editReason,
        });
      } else {
        await api.patch(`/api/admin/sessions/${session.id}`, {
          propertyId: propertyId || null,
          clockIn: fromLocalInput(clockIn),
          clockOut: fromLocalInput(clockOut),
          editReason,
        });

        // 休憩の変更を反映する
        for (const b of breaks) {
          const original = session.breaks.find((o) => o.id === b.id);
          if (!original) continue;

          const startChanged = toLocalInput(original.breakStart) !== b.start;
          const endChanged = toLocalInput(original.breakEnd) !== b.end;

          if (startChanged || endChanged) {
            await api.patch(`/api/admin/breaks/${b.id}`, {
              breakStart: fromLocalInput(b.start),
              breakEnd: fromLocalInput(b.end),
            });
          }
        }
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const removeBreak = async (breakId: string) => {
    if (!window.confirm('この休憩を削除しますか？')) return;
    try {
      await api.delete(`/api/admin/breaks/${breakId}`);
      setBreaks((prev) => prev.filter((b) => b.id !== breakId));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const removeSession = async () => {
    if (!session) return;
    if (!window.confirm('この勤務記録を削除しますか？元に戻せません。')) return;

    setSaving(true);
    try {
      await api.delete(`/api/admin/sessions/${session.id}`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={isNew ? '勤務記録を追加' : '勤務記録を修正'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {!isNew && (
            <Button variant="danger" onClick={removeSession} disabled={saving}>
              削除
            </Button>
          )}
          <Button
            type="submit"
            form="session-form"
            fullWidth
            size="lg"
            loading={saving}
          >
            保存する
          </Button>
        </div>
      }
    >
      <form id="session-form" onSubmit={submit} className="space-y-4">
        <ErrorBanner message={error} />

        {isNew && (
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
        )}

        <Field label="担当した棟">
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

        <Field label="出勤時刻" required>
          <Input
            type="datetime-local"
            value={clockIn}
            onChange={(e) => setClockIn(e.target.value)}
            required
          />
        </Field>

        <Field
          label="退勤時刻"
          hint="空欄にすると「勤務中」に戻ります"
        >
          <Input
            type="datetime-local"
            value={clockOut}
            onChange={(e) => setClockOut(e.target.value)}
          />
        </Field>

        {breaks.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">休憩</p>
            <ul className="space-y-2">
              {breaks.map((b, index) => (
                <li key={b.id} className="p-3 bg-slate-50 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-500">
                      休憩 {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeBreak(b.id)}
                      className="text-xs text-red-500 font-semibold"
                    >
                      削除
                    </button>
                  </div>
                  <Input
                    type="datetime-local"
                    value={b.start}
                    onChange={(e) =>
                      setBreaks((prev) =>
                        prev.map((p) =>
                          p.id === b.id ? { ...p, start: e.target.value } : p
                        )
                      )
                    }
                  />
                  <Input
                    type="datetime-local"
                    value={b.end}
                    onChange={(e) =>
                      setBreaks((prev) =>
                        prev.map((p) =>
                          p.id === b.id ? { ...p, end: e.target.value } : p
                        )
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field
          label="修正の理由"
          required
          hint="監査ログに記録されます"
        >
          <Textarea
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            placeholder="退勤の押し忘れのため、本人申告により18:00で登録"
            rows={2}
            required
          />
        </Field>
      </form>
    </Sheet>
  );
}
