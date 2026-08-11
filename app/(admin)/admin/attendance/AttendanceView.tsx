'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Property, UserProfile, WorkSession } from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import {
  formatDateJa,
  monthRange,
  toJstTimeString,
  todayJst,
} from '@/app/lib/domain/datetime';
import { formatDuration } from '@/app/lib/domain/format';
import { actualWorkMs, totalBreakMs } from '@/app/lib/domain/worktime';
import MonthNav from '@/app/components/MonthNav';
import Button from '@/app/components/ui/Button';
import { Field, Select } from '@/app/components/ui/Field';
import {
  Card,
  EmptyState,
  ErrorBanner,
  Spinner,
} from '@/app/components/ui/Feedback';
import SessionEditor from './SessionEditor';

interface RawSession extends Omit<WorkSession, 'clockIn' | 'clockOut' | 'breaks' | 'editedAt'> {
  clockIn: string;
  clockOut: string | null;
  editedAt: string | null;
  breaks: { id: string; sessionId: string; breakStart: string; breakEnd: string | null }[];
}

function parse(raw: RawSession): WorkSession {
  return {
    ...raw,
    clockIn: new Date(raw.clockIn),
    clockOut: raw.clockOut ? new Date(raw.clockOut) : null,
    editedAt: raw.editedAt ? new Date(raw.editedAt) : null,
    breaks: raw.breaks.map((b) => ({
      id: b.id,
      sessionId: b.sessionId,
      breakStart: new Date(b.breakStart),
      breakEnd: b.breakEnd ? new Date(b.breakEnd) : null,
    })),
  };
}

export default function AttendanceView() {
  const [month, setMonth] = useState(() => todayJst().slice(0, 7));
  const [userFilter, setUserFilter] = useState('');
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [staleIds, setStaleIds] = useState<string[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkSession | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (targetMonth: string) => {
    setLoading(true);
    const { from, to } = monthRange(targetMonth);

    try {
      const [sessionRes, userRes, propRes] = await Promise.all([
        api.get<{ sessions: RawSession[]; staleSessions: string[] }>(
          `/api/admin/sessions?from=${from}&to=${to}`
        ),
        api.get<{ users: UserProfile[] }>('/api/users'),
        api.get<{ properties: Property[] }>('/api/properties?all=1'),
      ]);
      setSessions(sessionRes.sessions.map(parse));
      setStaleIds(sessionRes.staleSessions);
      setUsers(userRes.users);
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

  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users]
  );
  const propertyMap = useMemo(
    () => new Map(properties.map((p) => [p.id, p])),
    [properties]
  );

  const filtered = userFilter
    ? sessions.filter((s) => s.userId === userFilter)
    : sessions;

  const now = new Date();

  return (
    <div className="space-y-4">
      <MonthNav month={month} onChange={setMonth} />

      <ErrorBanner message={error} />

      {staleIds.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold">
          退勤が押されていない勤務が {staleIds.length} 件あります。
          該当行から退勤時刻を入力してください。
        </div>
      )}

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Field label="スタッフで絞り込む">
            <Select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="">全員</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button onClick={() => setCreating(true)}>＋ 追加</Button>
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState icon="⏱" title="この月の勤務記録はありません" />
      ) : (
        <ul className="space-y-2">
          {filtered.map((session) => {
            const isStale = staleIds.includes(session.id);
            const property = session.propertyId
              ? propertyMap.get(session.propertyId)
              : null;

            return (
              <Card
                key={session.id}
                className={`p-4 ${isStale ? 'border-red-300 bg-red-50/40' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">
                      {formatDateJa(session.workDate)}
                    </p>
                    <p className="text-sm text-slate-600 mt-0.5">
                      {userMap.get(session.userId)?.name ||
                        userMap.get(session.userId)?.email ||
                        'スタッフ'}
                      {property && (
                        <>
                          <span
                            className="inline-block w-2 h-2 rounded-full mx-1.5 align-middle"
                            style={{ backgroundColor: property.color }}
                          />
                          {property.name}
                        </>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {toJstTimeString(session.clockIn)} 〜{' '}
                      {session.clockOut ? (
                        toJstTimeString(session.clockOut)
                      ) : (
                        <span className="text-red-600 font-bold">未退勤</span>
                      )}
                      {session.breaks.length > 0 && (
                        <span className="text-amber-600 ml-2">
                          休憩 {formatDuration(totalBreakMs(session.breaks, now))}
                        </span>
                      )}
                    </p>
                    {session.isManuallyEdited && (
                      <p className="text-xs text-slate-400 mt-1">
                        手動修正済み
                        {session.editReason && `: ${session.editReason}`}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-900">
                      {session.clockOut
                        ? formatDuration(actualWorkMs(session, now))
                        : '—'}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(session)}
                      className="mt-1"
                    >
                      修正
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </ul>
      )}

      {(editing || creating) && (
        <SessionEditor
          session={editing}
          users={users}
          properties={properties}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            void load(month);
          }}
        />
      )}
    </div>
  );
}
