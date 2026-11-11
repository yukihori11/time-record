'use client';

import { useState } from 'react';
import type { Property, Stay } from '@/app/types/domain';
import type { CleaningStatus } from '@/app/lib/domain/stays';
import { airbnbReservationUrl, staysOnDate } from '@/app/lib/domain/stays';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { rememberAirbnbVisit } from '@/app/lib/client/airbnb-return';
import Button from '@/app/components/ui/Button';
import { ErrorBanner } from '@/app/components/ui/Feedback';
import { Input, Textarea } from '@/app/components/ui/Field';
import type { MoveKind } from '@/app/components/StayBadges';
import { CLEANING_BADGE, GuestCount, MoveBadge, StayRange } from '@/app/components/StayBadges';

/**
 * 日付の詳細に出す Airbnb の宿泊。
 *
 * チェックインを一番上に置く。清掃はチェックイン当日に行うため、
 * 清掃が手配済みかをここで確かめ、未手配ならその場で予定を作れるようにする。
 */
export default function StaySection({
  date,
  stays,
  properties,
  cleaning,
  isAdmin,
  onCreateCleaning,
  onChanged,
}: {
  date: string;
  stays: Stay[];
  properties: Property[];
  cleaning: Map<string, CleaningStatus>;
  isAdmin: boolean;
  /** 清掃の予定作成画面を、棟と日付を入れた状態で開く */
  onCreateCleaning: (propertyId: string, date: string) => void;
  onChanged: () => void;
}) {
  // 取り込んだ順のままだと棟の並びがばらばらになる。
  // ホームと同じく、設定画面の棟の順に揃える
  const order = new Map(properties.map((p, i) => [p.id, i]));
  const byProperty = (list: Stay[]) =>
    [...list].sort((a, b) => (order.get(a.propertyId) ?? 99) - (order.get(b.propertyId) ?? 99));
  const moves = staysOnDate(stays, date);
  const checkIns = byProperty(moves.checkIns);
  const staying = byProperty(moves.staying);
  const checkOuts = byProperty(moves.checkOuts);
  const blocks = byProperty(moves.blocks);
  if (checkIns.length + staying.length + checkOuts.length + blocks.length === 0) {
    return null;
  }

  const propertyMap = new Map(properties.map((p) => [p.id, p]));

  return (
    <section>
      <SectionTitle>宿泊の出入り</SectionTitle>
      {/* 1日の流れに合わせて、出る（午前）→ 入る（午後）→ 滞在中 の順 */}
      <ul className="space-y-2">
        {checkOuts.map((s) => (
          <StayItem
            key={s.id}
            stay={s}
            kind="out"
            property={propertyMap.get(s.propertyId)}
            isAdmin={isAdmin}
            onChanged={onChanged}
          />
        ))}
        {checkIns.map((s) => (
          <StayItem
            key={s.id}
            stay={s}
            kind="in"
            property={propertyMap.get(s.propertyId)}
            cleaning={cleaning.get(s.id)}
            isAdmin={isAdmin}
            onCreateCleaning={onCreateCleaning}
            onChanged={onChanged}
          />
        ))}
        {staying.map((s) => (
          <StayItem
            key={s.id}
            stay={s}
            kind="stay"
            property={propertyMap.get(s.propertyId)}
            isAdmin={isAdmin}
            onChanged={onChanged}
          />
        ))}
        {blocks.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-sm"
          >
            <MoveBadge kind="block" />
            <div className="min-w-0">
              <p className="font-bold text-slate-600 truncate">
                {propertyMap.get(s.propertyId)?.name ?? '棟不明'}
              </p>
              <p className="text-xs text-slate-500">
                <StayRange stay={s} showNights={false} />
                <span className="ml-1.5">売り止め（予約ではありません）</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 詳細の中の小見出し。DayDetail と揃える */
export function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-xs font-bold text-slate-500 tracking-wide">{children}</h3>
      {right}
    </div>
  );
}

function StayItem({
  stay,
  kind,
  property,
  cleaning,
  isAdmin,
  onCreateCleaning,
  onChanged,
}: {
  stay: Stay;
  kind: MoveKind;
  property: Property | undefined;
  cleaning?: CleaningStatus;
  isAdmin: boolean;
  onCreateCleaning?: (propertyId: string, date: string) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const badge = cleaning ? CLEANING_BADGE[cleaning] : null;
  const tone =
    kind === 'in' ? 'bg-emerald-50/50' : kind === 'out' ? 'bg-orange-50/50' : 'bg-white';

  return (
    <li className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 border-l-4 ${tone}`}
        style={{ borderLeftColor: property?.color ?? '#94a3b8' }}
      >
        <MoveBadge kind={kind} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">
            {property?.name ?? '棟不明'}
            <span className="ml-2 text-xs">
              <GuestCount count={stay.guestCount} />
            </span>
          </p>
          <p className="text-xs text-slate-500">
            <StayRange stay={stay} />
          </p>
        </div>
        {isAdmin && <AirbnbLink code={stay.reservationCode} stay={stay} property={property} compact />}
      </div>

      {(stay.note || (badge && cleaning) || isAdmin) && (
        <div className="px-3 py-2.5 space-y-2 text-sm border-t border-slate-100">
          {/* 清掃はチェックイン当日。入る側にだけ出す */}
          {badge && cleaning && (
            <div
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold ${badge.className}`}
            >
              <span>
                {badge.icon} 当日の清掃：{badge.label}
              </span>
              {isAdmin && cleaning === 'missing' && onCreateCleaning && (
                <Button size="sm" onClick={() => onCreateCleaning(stay.propertyId, stay.checkIn)}>
                  清掃の予定を作る
                </Button>
              )}
            </div>
          )}

          {stay.note && (
            <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">
              {stay.note}
            </p>
          )}

          {isAdmin &&
            (editing ? (
              <GuestForm
                stay={stay}
                onDone={() => {
                  setEditing(false);
                  onChanged();
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  ✎ 人数・金額・メモを入力
                </button>
                {/* 金額は管理者にだけ届く。予約（ブロック以外）にだけ出す */}
                {stay.amount !== undefined && stay.kind === 'reserved' && (
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      stay.amount === null ? 'text-slate-400' : 'text-slate-700'
                    }`}
                  >
                    {stay.amount === null ? '金額 未入力' : `¥${stay.amount.toLocaleString('ja-JP')}`}
                  </span>
                )}
                {stay.reservationCode && (
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {stay.reservationCode}
                  </span>
                )}
              </div>
            ))}
        </div>
      )}
    </li>
  );
}

/** 人数・金額・メモの入力欄。Airbnb から戻ったときのシートでも使う */
export function GuestForm({
  stay,
  autoFocus = false,
  onDone,
  onCancel,
}: {
  stay: Stay;
  /** 開いたらすぐ人数を打てるようにする */
  autoFocus?: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [guestCount, setGuestCount] = useState(stay.guestCount ? String(stay.guestCount) : '');
  const [note, setNote] = useState(stay.note ?? '');
  const [amount, setAmount] = useState(
    stay.amount !== undefined && stay.amount !== null ? String(stay.amount) : ''
  );
  // 金額の表（0031）が無い環境では amount が付かない。そのときは欄を出さない
  const canEditAmount = stay.amount !== undefined && stay.kind === 'reserved';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/stays/${stay.id}`, {
        guestCount: guestCount === '' ? null : Number(guestCount),
        note,
        ...(canEditAmount ? { amount: amount === '' ? null : Number(amount) } : {}),
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-2">
      <ErrorBanner message={error} />
      <div className="flex items-center gap-2">
        <div className="w-24">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={guestCount}
            autoFocus={autoFocus}
            onChange={(e) => setGuestCount(e.target.value)}
            placeholder="人数"
          />
        </div>
        <span className="text-sm text-slate-600">名</span>
      </div>
      {canEditAmount && (
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">¥</span>
            <div className="w-40">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={100000000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="金額"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Airbnb の予約ページの「ホストの受取額」。管理者にだけ表示され、分析の売上に使います
          </p>
        </div>
      )}
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="メモ（スタッフにも表示）"
        rows={2}
        maxLength={1000}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={saving}>
          保存
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          やめる
        </Button>
      </div>
    </form>
  );
}

/**
 * Airbnb の予約ページを開く。人数を確かめて入力するために使う。
 *
 * stay を渡すと、Airbnb から戻ったときにその予約の入力欄が開く
 * （画面に AirbnbReturnSheet を置いておくこと）。
 */
export function AirbnbLink({
  code,
  stay,
  property,
  compact = false,
}: {
  code: string | null;
  stay?: Stay;
  property?: { name: string; color?: string | null };
  /** 行の右端に置く小さい形 */
  compact?: boolean;
}) {
  const url = airbnbReservationUrl(code);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        // ブロックには人数も金額も無いので、戻っても何も出さない
        if (stay && stay.kind === 'reserved') rememberAirbnbVisit(stay, property);
      }}
      className={`shrink-0 inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 ${
        compact ? 'text-[11px] px-2 py-1' : 'text-xs px-2.5 py-1.5'
      }`}
    >
      {compact ? 'Airbnb ↗' : 'Airbnb で予約を開く ↗'}
    </a>
  );
}
