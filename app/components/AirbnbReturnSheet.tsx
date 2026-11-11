'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from '@/app/components/ui/Sheet';
import { GuestCount, StayRange } from '@/app/components/StayBadges';
import { GuestForm } from '@/app/calendar/StaySection';
import {
  markAirbnbLeft,
  takeAirbnbReturn,
  type AirbnbVisit,
} from '@/app/lib/client/airbnb-return';

/**
 * Airbnb の予約ページから戻ってきたとき、その予約の「人数・金額・メモ」の入力欄を
 * 下から出す。保存するか、×・背景・下へのスワイプで閉じる。
 *
 * 管理者の画面（ホーム・カレンダー）に1つ置く。
 * onSaved を省くと、保存後にページのデータを取り直す（サーバーで作る画面向け）。
 */
export default function AirbnbReturnSheet({ onSaved }: { onSaved?: () => void }) {
  const router = useRouter();
  const [visit, setVisit] = useState<AirbnbVisit | null>(null);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'hidden') {
        markAirbnbLeft();
        return;
      }
      const found = takeAirbnbReturn();
      if (found) setVisit(found);
    };
    // 離れている間にページが読み込み直された場合に備え、開いた時点でも確かめる
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pageshow', check);
    };
  }, []);

  if (!visit) return null;

  const { stay } = visit;
  const close = () => setVisit(null);

  return (
    <Sheet title="Airbnb で確かめた内容を入力" onClose={close}>
      <div
        className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 border-l-4 mb-3"
        style={{ borderLeftColor: visit.propertyColor ?? '#94a3b8' }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">
            {visit.propertyName}
            <span className="ml-2 text-xs">
              <GuestCount count={stay.guestCount} />
            </span>
          </p>
          <p className="text-xs text-slate-500">
            <StayRange stay={stay} />
          </p>
        </div>
        {stay.reservationCode && (
          <span className="text-[11px] text-slate-400 tabular-nums">{stay.reservationCode}</span>
        )}
      </div>
      <GuestForm
        stay={stay}
        autoFocus
        onDone={() => {
          close();
          if (onSaved) onSaved();
          else router.refresh();
        }}
        onCancel={close}
      />
    </Sheet>
  );
}
