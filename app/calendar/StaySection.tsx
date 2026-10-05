'use client';

import { useState } from 'react';
import type { Property, Stay } from '@/app/types/domain';
import type { CleaningStatus } from '@/app/lib/domain/stays';
import { staysOnDate } from '@/app/lib/domain/stays';
import { formatDateJa } from '@/app/lib/domain/datetime';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import Button from '@/app/components/ui/Button';
import { ErrorBanner } from '@/app/components/ui/Feedback';
import { Input, Textarea } from '@/app/components/ui/Field';
import { CLEANING_MARK } from './CalendarGrid';

const CLEANING_STYLE: Record<CleaningStatus, string> = {
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unassigned: 'bg-amber-50 text-amber-700 border-amber-200',
  missing: 'bg-red-50 text-red-600 border-red-200',
};

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
  const { checkIns, staying, checkOuts } = staysOnDate(stays, date);
  if (checkIns.length + staying.length + checkOuts.length === 0) return null;

  const propertyMap = new Map(properties.map((p) => [p.id, p]));

  return (
    <section>
      <h3 className="text-xs font-bold text-slate-500 mb-2">Airbnb の宿泊</h3>
      <ul className="space-y-2">
        {checkIns.map((s) => (
          <StayItem
            key={s.id}
            stay={s}
            label="チェックイン"
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
            label="滞在中"
            property={propertyMap.get(s.propertyId)}
            isAdmin={isAdmin}
            onChanged={onChanged}
          />
        ))}
        {checkOuts.map((s) => (
          <StayItem
            key={s.id}
            stay={s}
            label="チェックアウト"
            property={propertyMap.get(s.propertyId)}
            isAdmin={isAdmin}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  );
}

function StayItem({
  stay,
  label,
  property,
  cleaning,
  isAdmin,
  onCreateCleaning,
  onChanged,
}: {
  stay: Stay;
  label: string;
  property: Property | undefined;
  cleaning?: CleaningStatus;
  isAdmin: boolean;
  onCreateCleaning?: (propertyId: string, date: string) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const mark = cleaning ? CLEANING_MARK[cleaning] : null;

  return (
    <li className="rounded-xl border border-slate-200 overflow-hidden">
      <div
        className="px-3 py-2 text-white text-sm font-bold flex justify-between items-center gap-2"
        style={{ backgroundColor: property?.color ?? '#94a3b8' }}
      >
        <span className="truncate">
          {label}
          <span className="opacity-90 font-normal ml-2">{property?.name ?? '棟不明'}</span>
        </span>
        {stay.guestCount ? (
          <span className="shrink-0">{stay.guestCount}名</span>
        ) : (
          <span className="shrink-0 text-xs px-1.5 py-0.5 rounded border border-dashed border-white/80 font-semibold">
            人数未記入
          </span>
        )}
      </div>

      <div className="px-3 py-2.5 space-y-2 text-sm bg-white">
        <p className="text-xs text-slate-500">
          {formatDateJa(stay.checkIn)} 〜 {formatDateJa(stay.checkOut)}
        </p>

        {isAdmin && stay.reservationCode && (
          <p className="text-xs text-slate-400">予約コード {stay.reservationCode}</p>
        )}

        {stay.note && (
          <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2 py-1.5 whitespace-pre-wrap">
            {stay.note}
          </p>
        )}

        {mark && cleaning && (
          <div
            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold ${CLEANING_STYLE[cleaning]}`}
          >
            <span>
              {mark.icon} 当日の清掃：{mark.label}
            </span>
            {isAdmin && cleaning === 'missing' && onCreateCleaning && (
              <Button size="sm" onClick={() => onCreateCleaning(stay.propertyId, stay.checkIn)}>
                清掃の予定を作る
              </Button>
            )}
          </div>
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
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              人数・メモを入力
            </Button>
          ))}
      </div>
    </li>
  );
}

function GuestForm({
  stay,
  onDone,
  onCancel,
}: {
  stay: Stay;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [guestCount, setGuestCount] = useState(stay.guestCount ? String(stay.guestCount) : '');
  const [note, setNote] = useState(stay.note ?? '');
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
            onChange={(e) => setGuestCount(e.target.value)}
            placeholder="人数"
          />
        </div>
        <span className="text-sm text-slate-600">名</span>
      </div>
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
