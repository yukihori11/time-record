'use client';

import { useState } from 'react';
import type {
  Property,
  Reservation,
  Shift,
  UserProfile,
} from '@/app/types/domain';
import type { DayDetailData } from '@/app/lib/domain/occupancy';
import { formatDateJa } from '@/app/lib/domain/datetime';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import Button from '@/app/components/ui/Button';
import { Card, ErrorBanner } from '@/app/components/ui/Feedback';
import { Field, Textarea } from '@/app/components/ui/Field';

export default function DayDetail({
  detail,
  properties,
  users,
  currentUserId,
  isAdmin,
  onChanged,
  onEditReservation,
}: {
  detail: DayDetailData;
  properties: Property[];
  users: UserProfile[];
  currentUserId: string;
  isAdmin: boolean;
  onChanged: () => void;
  onEditReservation?: (reservation: Reservation) => void;
}) {
  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <Card className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-900">
          {formatDateJa(detail.date)}
        </h2>
        {detail.totalGuests > 0 && (
          <span className="text-sm font-bold text-blue-600">
            宿泊 {detail.totalGuests}名
          </span>
        )}
      </div>

      {/* その日の予定（宿泊・清掃・準備など） */}
      <section>
        <h3 className="text-xs font-bold text-slate-500 mb-2">予定</h3>
        {detail.reservations.length === 0 ? (
          <p className="text-sm text-slate-400">予定はありません</p>
        ) : (
          <ul className="space-y-2">
            {detail.reservations.map((item) => {
              const r = item.reservation;
              const hasGuests = item.type?.hasGuests !== false;

              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-slate-200 overflow-hidden"
                >
                  <div
                    className="px-3 py-2 text-white text-sm font-bold flex justify-between items-center"
                    style={{ backgroundColor: item.type?.color ?? '#94a3b8' }}
                  >
                    <span>
                      {item.type?.icon} {item.type?.name ?? '種別なし'}
                      <span className="opacity-90 font-normal ml-2">
                        {item.property?.name ?? '棟不明'}
                      </span>
                    </span>
                    {hasGuests && r.guestCount > 0 && (
                      <span>{r.guestCount}名</span>
                    )}
                  </div>

                  <div className="px-3 py-2.5 space-y-1 text-sm bg-white">
                    {/* 宿泊なら何泊目か、作業なら当日のみと分かるように */}
                    {hasGuests && item.totalNights > 1 ? (
                      <p className="text-slate-500 text-xs">
                        {r.checkIn} 〜 {r.checkOut}（{item.totalNights}泊）
                        <span className="ml-2 font-semibold text-slate-700">
                          {item.nightNumber}泊目
                        </span>
                      </p>
                    ) : (
                      <p className="text-slate-500 text-xs">
                        {r.checkIn}
                        {r.checkOut !== r.checkIn && ` 〜 ${r.checkOut}`}
                      </p>
                    )}

                    {item.isStart && hasGuests && item.totalNights > 1 && (
                      <p className="text-xs text-emerald-600 font-semibold">
                        本日チェックイン
                      </p>
                    )}
                    {item.isLastNight && hasGuests && item.totalNights > 1 && (
                      <p className="text-xs text-blue-600 font-semibold">
                        最終泊（翌日チェックアウト）
                      </p>
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
      {detail.checkOuts.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-slate-500 mb-2">
            チェックアウト
          </h3>
          <ul className="space-y-1.5">
            {detail.checkOuts.map((r) => (
              <li
                key={r.id}
                className="text-sm px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex justify-between"
              >
                <span className="font-semibold text-slate-700">
                  {propertyMap.get(r.propertyId)?.name ?? '棟不明'}
                </span>
                <span className="text-slate-500">{r.guestCount}名 退室</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* この日に入るスタッフ */}
      <ShiftSection
        shifts={detail.shifts}
        properties={properties}
        userMap={userMap}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
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
  isAdmin,
  onChanged,
}: {
  shifts: Shift[];
  properties: Property[];
  userMap: Map<string, UserProfile>;
  currentUserId: string;
  isAdmin: boolean;
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

  /**
   * シフトの取り消し。
   *
   * 辞退されたが代わりに入れる人がいない場合に、
   * 予定そのものを消せるようにしておく。
   */
  const remove = async (shiftId: string) => {
    if (!window.confirm('このシフトを取り消しますか？')) return;

    setBusyId(shiftId);
    setError(null);
    try {
      await api.delete(`/api/shifts/${shiftId}`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  /** 割り当て直す（未回答に戻す） */
  const reset = async (shiftId: string) => {
    setBusyId(shiftId);
    setError(null);
    try {
      await api.patch(`/api/shifts/${shiftId}`, { status: 'assigned' });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const pending = shifts.filter((s) => s.status === 'assigned').length;
  const declined = shifts.filter((s) => s.status === 'declined').length;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-slate-500">この日に入る人</h3>
        {isAdmin && (pending > 0 || declined > 0) && (
          <span className="text-xs font-semibold">
            {pending > 0 && (
              <span className="text-amber-600">未回答{pending}</span>
            )}
            {pending > 0 && declined > 0 && ' / '}
            {declined > 0 && <span className="text-red-500">辞退{declined}</span>}
          </span>
        )}
      </div>

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
                      {userMap.get(shift.userId)?.name || 'スタッフ'}
                      {isMine && (
                        <span className="ml-1.5 text-xs text-blue-600">
                          自分
                        </span>
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
                      {shift.startTime && (
                        <span className="ml-1.5 font-semibold text-slate-700">
                          {shift.startTime} 入り
                        </span>
                      )}
                      {shift.endTime && ` 〜${shift.endTime}`}
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

                {/* 管理者はシフトを取り消したり、割り当て直したりできる */}
                {isAdmin && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                    {shift.status === 'declined' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busyId === shift.id}
                        onClick={() => reset(shift.id)}
                      >
                        もう一度依頼する
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busyId === shift.id}
                      onClick={() => remove(shift.id)}
                      className="text-red-500"
                    >
                      このシフトを取り消す
                    </Button>
                  </div>
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
