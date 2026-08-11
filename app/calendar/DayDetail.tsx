'use client';

import { useState } from 'react';
import type { Property, Reservation, Shift, UserProfile } from '@/app/types/domain';
import type { DayOccupancy } from '@/app/lib/domain/occupancy';
import { checkOutsOn } from '@/app/lib/domain/occupancy';
import { formatDateJa } from '@/app/lib/domain/datetime';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import Button from '@/app/components/ui/Button';
import { Card, ErrorBanner } from '@/app/components/ui/Feedback';
import { Field, Textarea } from '@/app/components/ui/Field';

export default function DayDetail({
  day,
  reservations,
  properties,
  users,
  currentUserId,
  isAdmin,
  onChanged,
  onEditReservation,
}: {
  day: DayOccupancy;
  reservations: Reservation[];
  properties: Property[];
  users: UserProfile[];
  currentUserId: string;
  isAdmin: boolean;
  onChanged: () => void;
  onEditReservation?: (reservation: Reservation) => void;
}) {
  const checkOuts = checkOutsOn(reservations, day.date);
  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <Card className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-900">{formatDateJa(day.date)}</h2>
        {day.totalGuests > 0 && (
          <span className="text-sm font-bold text-blue-600">
            合計 {day.totalGuests}名
          </span>
        )}
      </div>

      {/* 宿泊中 */}
      <section>
        <h3 className="text-xs font-bold text-slate-500 mb-2">宿泊</h3>
        {day.stays.length === 0 ? (
          <p className="text-sm text-slate-400">宿泊予定はありません</p>
        ) : (
          <ul className="space-y-2">
            {day.stays.map((stay) => {
              const r = stay.reservation;
              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-slate-200 overflow-hidden"
                >
                  <div
                    className="px-3 py-2 text-white text-sm font-bold flex justify-between items-center"
                    style={{ backgroundColor: stay.property?.color ?? '#94a3b8' }}
                  >
                    <span>{stay.property?.name ?? '棟不明'}</span>
                    <span>{r.guestCount}名</span>
                  </div>
                  <div className="px-3 py-2.5 space-y-1 text-sm bg-white">
                    {r.guestName && (
                      <p className="font-semibold text-slate-800">{r.guestName}</p>
                    )}
                    <p className="text-slate-500 text-xs">
                      {r.checkIn} 〜 {r.checkOut}（{r.nights}泊）
                      <span className="ml-2 font-semibold text-slate-600">
                        {stay.nightNumber}泊目
                      </span>
                    </p>
                    {stay.isCheckIn && (
                      <p className="text-xs text-emerald-600 font-semibold">
                        本日チェックイン
                        {r.checkInTime && ` ${r.checkInTime.slice(0, 5)}`}
                      </p>
                    )}
                    {stay.isLastNight && (
                      <p className="text-xs text-blue-600 font-semibold">
                        最終泊（翌日チェックアウト
                        {r.checkOutTime && ` ${r.checkOutTime.slice(0, 5)}`}）
                      </p>
                    )}
                    {r.source && (
                      <p className="text-xs text-slate-400">経路: {r.source}</p>
                    )}
                    {r.contact && (
                      <p className="text-xs text-slate-400">連絡先: {r.contact}</p>
                    )}
                    {r.note && (
                      <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2 py-1.5 mt-1.5 whitespace-pre-wrap">
                        {r.note}
                      </p>
                    )}
                    {isAdmin && onEditReservation && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEditReservation(r)}
                        className="mt-1"
                      >
                        編集
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* チェックアウト */}
      {checkOuts.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-slate-500 mb-2">
            チェックアウト
          </h3>
          <ul className="space-y-1.5">
            {checkOuts.map((r) => (
              <li
                key={r.id}
                className="text-sm px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex justify-between"
              >
                <span className="font-semibold text-slate-700">
                  {propertyMap.get(r.propertyId)?.name ?? '棟不明'}
                </span>
                <span className="text-slate-500">
                  {r.guestName || `${r.guestCount}名`}
                  {r.checkOutTime && ` / ${r.checkOutTime.slice(0, 5)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* シフト */}
      <ShiftSection
        shifts={day.shifts}
        properties={properties}
        userMap={userMap}
        currentUserId={currentUserId}
        onChanged={onChanged}
      />
    </Card>
  );
}

function ShiftSection({
  shifts,
  properties,
  userMap,
  currentUserId,
  onChanged,
}: {
  shifts: Shift[];
  properties: Property[];
  userMap: Map<string, UserProfile>;
  currentUserId: string;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const propertyMap = new Map(properties.map((p) => [p.id, p]));

  const respond = async (
    shiftId: string,
    response: 'accepted' | 'declined',
    declineReason?: string
  ) => {
    setBusyId(shiftId);
    setError(null);
    try {
      await api.post(`/api/shifts/${shiftId}/respond`, {
        response,
        reason: declineReason,
      });
      setDecliningId(null);
      setReason('');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <h3 className="text-xs font-bold text-slate-500 mb-2">シフト</h3>
      <ErrorBanner message={error} />

      {shifts.length === 0 ? (
        <p className="text-sm text-slate-400">シフトはありません</p>
      ) : (
        <ul className="space-y-2 mt-2">
          {shifts.map((shift) => {
            const isMine = shift.userId === currentUserId;
            const canRespond = isMine && shift.status === 'assigned';
            const property = shift.propertyId
              ? propertyMap.get(shift.propertyId)
              : null;

            return (
              <li
                key={shift.id}
                className={`rounded-xl border px-3 py-2.5 ${
                  isMine ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {userMap.get(shift.userId)?.name ||
                        userMap.get(shift.userId)?.email ||
                        'スタッフ'}
                      {isMine && (
                        <span className="ml-1.5 text-xs text-blue-600">自分</span>
                      )}
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
                  <StatusBadge status={shift.status} />
                </div>

                {shift.note && (
                  <p className="text-xs text-slate-600 mt-1.5">{shift.note}</p>
                )}

                {canRespond && decliningId !== shift.id && (
                  <div className="flex gap-2 mt-2.5">
                    <Button
                      size="sm"
                      variant="success"
                      loading={busyId === shift.id}
                      onClick={() => respond(shift.id, 'accepted')}
                    >
                      承諾する
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDecliningId(shift.id)}
                    >
                      辞退する
                    </Button>
                  </div>
                )}

                {decliningId === shift.id && (
                  <div className="mt-2.5 space-y-2">
                    <Field label="辞退の理由（任意）">
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="都合が悪いため"
                        rows={2}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        loading={busyId === shift.id}
                        onClick={() => respond(shift.id, 'declined', reason)}
                      >
                        辞退を確定
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDecliningId(null);
                          setReason('');
                        }}
                      >
                        やめる
                      </Button>
                    </div>
                  </div>
                )}

                {shift.status === 'declined' && shift.declineReason && (
                  <p className="text-xs text-red-500 mt-1.5">
                    理由: {shift.declineReason}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
    <span
      className={`shrink-0 px-2 py-1 rounded-full text-xs font-bold ${style}`}
    >
      {label}
    </span>
  );
}
