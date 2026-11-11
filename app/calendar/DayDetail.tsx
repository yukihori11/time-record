'use client';

import { useState } from 'react';
import type {
  DayActual,
  Property,
  Schedule,
  Shift,
  Stay,
  UserProfile,
} from '@/app/types/domain';
import type { DayDetailData } from '@/app/lib/domain/occupancy';
import type { CleaningStatus } from '@/app/lib/domain/stays';
import StaySection, { SectionTitle } from './StaySection';
import { staysOnDate } from '@/app/lib/domain/stays';
import { formatDateJa, isPast } from '@/app/lib/domain/datetime';
import { formatDuration, formatYen } from '@/app/lib/domain/format';
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
  actuals,
  onChanged,
  onEditSchedule,
  stays,
  cleaning,
  onCreateCleaning,
}: {
  detail: DayDetailData;
  properties: Property[];
  users: UserProfile[];
  currentUserId: string;
  isAdmin: boolean;
  /** その日の実績（打刻の結果） */
  actuals: DayActual[];
  onChanged: () => void;
  onEditSchedule?: (schedule: Schedule) => void;
  /** Airbnb の宿泊（表示中の月の分） */
  stays: Stay[];
  cleaning: Map<string, CleaningStatus>;
  onCreateCleaning: (propertyId: string, date: string) => void;
}) {
  const userMap = new Map(users.map((u) => [u.id, u]));
  const moves = staysOnDate(stays, detail.date);

  return (
    <Card className="p-4 space-y-5">
      {/* その日の概要。開いた瞬間に何がある日か分かるように */}
      <div>
        <h2 className="text-lg font-bold text-slate-900">
          {formatDateJa(detail.date)}
        </h2>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-bold">
          {moves.checkOuts.length > 0 && (
            <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-700">
              ↑ OUT {moves.checkOuts.length}
            </span>
          )}
          {moves.checkIns.length > 0 && (
            <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
              ↓ IN {moves.checkIns.length}
            </span>
          )}
          {moves.staying.length > 0 && (
            <span className="px-2 py-1 rounded-full bg-sky-100 text-sky-700">
              滞在中 {moves.staying.length}
            </span>
          )}
          <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">
            予定 {detail.schedules.length}
          </span>
          <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">
            担当 {detail.shifts.length}人
          </span>
          {detail.totalGuests > 0 && (
            <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">
              宿泊 {detail.totalGuests}名
            </span>
          )}
        </div>
      </div>

      {/* チェックインと当日の清掃。漏れを防ぐため予定より上に置く */}
      <StaySection
        date={detail.date}
        stays={stays}
        properties={properties}
        cleaning={cleaning}
        isAdmin={isAdmin}
        onCreateCleaning={onCreateCleaning}
        onChanged={onChanged}
      />

      {/* その日の予定 */}
      <section>
        <SectionTitle>予定</SectionTitle>
        {detail.schedules.length === 0 ? (
          <p className="text-sm text-slate-400 px-3 py-2 rounded-lg bg-slate-50">
            予定はありません
          </p>
        ) : (
          <ul className="space-y-2">
            {detail.schedules.map((item) => {
              const sc = item.schedule;
              const hasGuests = item.type?.hasGuests !== false;
              const color = item.type?.color ?? '#94a3b8';

              return (
                <li
                  key={sc.id}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 border-l-4"
                  style={{ borderLeftColor: item.property?.color ?? '#94a3b8' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${color}22`, color }}
                    >
                      {item.type?.icon} {item.type?.name ?? '種別なし'}
                    </span>
                    <span className="text-sm font-bold text-slate-800 truncate">
                      {item.property?.name ?? '棟不明'}
                    </span>
                    {hasGuests && sc.guestCount > 0 && (
                      <span className="text-xs font-semibold text-slate-600 shrink-0">
                        {sc.guestCount}名
                      </span>
                    )}
                    {isAdmin && onEditSchedule && (
                      <button
                        onClick={() => onEditSchedule(sc)}
                        className="ml-auto shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-700 px-1"
                      >
                        ✎ 編集
                      </button>
                    )}
                  </div>
                  {sc.note && (
                    <p className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">
                      {sc.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* この日に入るスタッフ */}
      <ShiftSection
        shifts={detail.shifts}
        properties={properties}
        userMap={userMap}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        actuals={actuals}
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
  actuals,
  onChanged,
}: {
  shifts: Shift[];
  properties: Property[];
  userMap: Map<string, UserProfile>;
  currentUserId: string;
  isAdmin: boolean;
  actuals: DayActual[];
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
      <SectionTitle
        right={
          isAdmin && (pending > 0 || declined > 0) ? (
            <span className="text-xs font-semibold">
              {pending > 0 && <span className="text-amber-600">未回答{pending}</span>}
              {pending > 0 && declined > 0 && ' / '}
              {declined > 0 && <span className="text-red-500">辞退{declined}</span>}
            </span>
          ) : undefined
        }
      >
        担当スタッフ
      </SectionTitle>

      <ErrorBanner message={error} />

      {shifts.length === 0 ? (
        <p className="text-sm text-slate-400 px-3 py-2 rounded-lg bg-slate-50">
          シフトはありません
        </p>
      ) : (
        <ul className="space-y-2 mt-2">
          {shifts.map((shift) => {
            const isMine = shift.userId === currentUserId;
            // 回答済みでも変更できる。ただし過ぎた日は不可。
            // サーバー側（0027）も同じ判定で拒否する。
            const canRespond = isMine && !isPast(shift.shiftDate);
            const property = shift.propertyId
              ? propertyMap.get(shift.propertyId)
              : null;

            return (
              <li
                key={shift.id}
                className={`rounded-xl border px-3 py-2.5 ${
                  isMine ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center text-sm font-bold ${AVATAR[shift.status]}`}
                    aria-hidden
                  >
                    {Array.from(userMap.get(shift.userId)?.name || 'ス')[0]}
                  </span>
                  <div className="min-w-0 flex-1">
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

                {/* 実績。打刻していれば予定の下に出す */}
                {(() => {
                  const actual = actuals.find((a) => a.userId === shift.userId);
                  if (!actual) return null;

                  // 金額は本人と管理者にだけ見せる
                  const canSeeAmount = isAdmin || isMine;

                  return (
                    <div className="mt-2 px-2.5 py-2 rounded-lg bg-white border border-slate-200">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">
                          実績
                          {actual.isWorking && (
                            <span className="ml-1.5 text-emerald-600 font-bold">
                              勤務中
                            </span>
                          )}
                        </span>
                        <span className="text-sm font-bold text-slate-800 tabular-nums">
                          {formatDuration(actual.actualWorkMs)}
                        </span>
                      </div>

                      {actual.breakMs > 0 && (
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="text-xs text-slate-400">休憩</span>
                          <span className="text-xs text-amber-600 tabular-nums">
                            {formatDuration(actual.breakMs)}
                          </span>
                        </div>
                      )}

                      {canSeeAmount && actual.hourlyWage !== null && (
                        <div className="flex items-center justify-between gap-2 mt-1 pt-1 border-t border-slate-100">
                          <span className="text-xs text-slate-500">
                            金額
                            {actual.isGuaranteeApplied && (
                              <span className="ml-1 text-emerald-600 font-semibold">
                                保証
                              </span>
                            )}
                          </span>
                          <span className="text-sm font-bold text-blue-600 tabular-nums">
                            {formatYen(actual.amount)}
                          </span>
                        </div>
                      )}

                      {canSeeAmount && actual.hourlyWage === null && (
                        <p className="text-xs text-amber-600 mt-1">
                          時給が未設定です
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* 回答済みなら逆の選択肢だけを出す */}
                {canRespond && decliningId !== shift.id && (
                  <div className="flex gap-2 mt-2.5">
                    {shift.status !== 'accepted' && (
                      <Button
                        size="sm"
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
                        size="sm"
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
                  <div className="mt-2.5 space-y-2">
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

/** カレンダーのスタッフの丸と同じ色づかい */
const AVATAR: Record<Shift['status'], string> = {
  accepted: 'bg-emerald-500 text-white',
  assigned: 'bg-white text-amber-600 ring-1 ring-inset ring-amber-400',
  declined: 'bg-red-50 text-red-300',
};

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
