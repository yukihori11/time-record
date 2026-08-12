'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Property, Shift } from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { formatDateJa, isPast } from '@/app/lib/domain/datetime';
import { useAuth } from '@/app/contexts/AuthContext';
import MonthNav from '@/app/components/MonthNav';
import NotificationList from '@/app/components/NotificationList';
import Button from '@/app/components/ui/Button';
import { Field, Textarea } from '@/app/components/ui/Field';
import {
  Card,
  EmptyState,
  ErrorBanner,
  Spinner,
} from '@/app/components/ui/Feedback';

interface Props {
  initialMonth: string;
  initialShifts: Shift[];
  initialProperties: Property[];
}

export default function ShiftsView({
  initialMonth,
  initialShifts,
  initialProperties,
}: Props) {
  const { user } = useAuth();
  const [month, setMonth] = useState(initialMonth);
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(
    async (targetMonth: string) => {
      if (!user) return;
      setLoading(true);
      try {
        const [shiftRes, propRes] = await Promise.all([
          api.get<{ shifts: Shift[] }>(
            `/api/shifts?month=${targetMonth}&userId=${user.id}`
          ),
          api.get<{ properties: Property[] }>('/api/properties'),
        ]);
        setShifts(shiftRes.shifts);
        setProperties(propRes.properties);
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  // 月を切り替えたら取りに行く。
  //
  // 初期表示の月だけは、すでにサーバーで取得した分があるので
  // 一度目は通信を省く。ただし戻ってきたときは取り直す。
  // initialShifts で復元すると、承諾済みのシフトが
  // 未回答の状態に巻き戻ってしまうため。
  const visited = useRef(false);

  useEffect(() => {
    if (month === initialMonth && !visited.current) {
      visited.current = true;
      return;
    }
    visited.current = true;
    void load(month);
  }, [month, initialMonth, load]);

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
      await load(month);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  const pending = shifts.filter((s) => s.status === 'assigned');

  return (
    <div className="space-y-4">
      {/* 通知を消してしまっても、ここで確認できる */}
      <NotificationList />

      <MonthNav month={month} onChange={setMonth} />

      <ErrorBanner message={error} />

      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm font-semibold">
          未回答のシフトが {pending.length} 件あります
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : shifts.length === 0 ? (
        <EmptyState
          icon="📋"
          title="この月のシフトはありません"
          description="管理者がシフトを割り当てるとここに表示されます"
        />
      ) : (
        <ul className="space-y-2">
          {shifts.map((shift) => {
            const property = shift.propertyId
              ? propertyMap.get(shift.propertyId)
              : null;

            return (
              <Card key={shift.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">
                      {formatDateJa(shift.shiftDate)}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {property && (
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                          style={{ backgroundColor: property.color }}
                        />
                      )}
                      {property?.name ?? '棟未指定'}
                      {shift.startTime && ` / ${shift.startTime}`}
                      {shift.endTime && `〜${shift.endTime}`}
                    </p>
                    {shift.note && (
                      <p className="text-sm text-slate-600 mt-1.5">
                        {shift.note}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={shift.status} />
                </div>

                {/*
                  未回答なら承諾・辞退の両方を出す。
                  回答済みなら、逆の選択肢だけを出す。
                  同じ回答を押しても弾かれるので見せない。

                  過ぎたシフトは変えられない。実際に働いた
                  記録と食い違うため、サーバー側でも拒否する。
                */}
                {!isPast(shift.shiftDate) && decliningId !== shift.id && (
                  <div className="flex gap-2 mt-3">
                    {shift.status !== 'accepted' && (
                      <Button
                        size="md"
                        variant="success"
                        loading={busyId === shift.id}
                        onClick={() => respond(shift.id, 'accepted')}
                      >
                        {shift.status === 'declined'
                          ? 'やっぱり承諾する'
                          : '承諾する'}
                      </Button>
                    )}
                    {shift.status !== 'declined' && (
                      <Button
                        size="md"
                        variant="secondary"
                        onClick={() => setDecliningId(shift.id)}
                      >
                        {shift.status === 'accepted'
                          ? '承諾を取り消す'
                          : '辞退する'}
                      </Button>
                    )}
                  </div>
                )}

                {decliningId === shift.id && (
                  <div className="mt-3 space-y-2">
                    <Field label="理由（任意）">
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="都合が悪いため"
                        rows={2}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        size="md"
                        variant="danger"
                        loading={busyId === shift.id}
                        onClick={() => respond(shift.id, 'declined', reason)}
                      >
                        辞退を確定
                      </Button>
                      <Button
                        size="md"
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
                  <p className="text-xs text-red-500 mt-2">
                    理由: {shift.declineReason}
                  </p>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Shift['status'] }) {
  const style = {
    assigned: 'bg-amber-100 text-amber-700',
    accepted: 'bg-emerald-100 text-emerald-700',
    declined: 'bg-red-100 text-red-600',
  }[status];

  const label = { assigned: '未回答', accepted: '承諾済み', declined: '辞退' }[
    status
  ];

  return (
    <span
      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${style}`}
    >
      {label}
    </span>
  );
}
