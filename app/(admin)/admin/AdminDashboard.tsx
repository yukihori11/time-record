import Link from 'next/link';
import type {
  MonthlySalary,
  Property,
  ReservationType,
  Schedule,
  Shift,
} from '@/app/types/domain';
import { formatDateJa, todayJst } from '@/app/lib/domain/datetime';
import type { CheckInItem, CleaningStatus } from '@/app/lib/domain/stays';
import { airbnbReservationUrl } from '@/app/lib/domain/stays';
import { formatYen } from '@/app/lib/domain/format';
import { Card } from '@/app/components/ui/Feedback';
import NotificationList from '@/app/components/NotificationList';

interface SalaryRow {
  user: { id: string; name: string; email: string };
  salary: MonthlySalary;
}

const MENU = [
  { href: '/calendar', label: '予定とシフト', icon: '📅', desc: '予約作成時に割当' },
  { href: '/admin/attendance', label: '勤怠管理', icon: '⏱', desc: '打刻の確認・修正' },
  { href: '/admin/wages', label: '時給設定', icon: '💰', desc: 'スタッフごとの時給' },
  { href: '/admin/salary', label: '給与集計', icon: '📊', desc: '月次の支給額' },
  { href: '/admin/settings', label: '設定', icon: '⚙', desc: '給与ルール・棟・権限' },
];

interface DashboardData {
  salaries: SalaryRow[];
  grandTotal: number;
  schedules: Schedule[];
  properties: Property[];
  types: ReservationType[];
  shifts: Shift[];
  staleCount: number;
  checkIns: {
    today: { date: string; items: CheckInItem[] };
    tomorrow: { date: string; items: CheckInItem[] };
  };
}

const CLEANING_BADGE: Record<CleaningStatus, { label: string; className: string }> = {
  ready: { label: '✅ 清掃OK', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  unassigned: { label: '🟡 担当未確定', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  missing: { label: '🔴 清掃未手配', className: 'bg-red-50 text-red-600 border-red-200' },
};

export default function AdminDashboard({
  initialData,
}: {
  initialData: DashboardData;
}) {
  // サーバー側で取得済み。表示のためだけの再取得はしない。
  const {
    salaries,
    grandTotal,
    schedules,
    properties,
    types,
    shifts,
    staleCount,
    checkIns,
  } = initialData;

  const today = todayJst();
  // 予定は1日単位なので、その日の分を拾うだけ
  const activeToday = schedules.filter(
    (s) => s.status === 'confirmed' && s.scheduleDate === today
  );
  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  const typeMap = new Map(types.map((t) => [t.id, t]));

  // 客が滞在する種別だけを人数に数える
  const guestsToday = activeToday
    .filter((r) => typeMap.get(r.typeId)?.hasGuests !== false)
    .reduce((sum, r) => sum + r.guestCount, 0);

  const pendingShifts = shifts.filter((s) => s.status === 'assigned').length;
  const declinedShifts = shifts.filter((s) => s.status === 'declined').length;

  return (
    <div className="space-y-4">
      {/* スタッフの回答など。通知を消しても後から確認できる */}
      <NotificationList />

      {staleCount > 0 && (
        <Link href="/admin/attendance" className="block">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold">
            退勤が押されていない勤務が {staleCount} 件あります → 確認する
          </div>
        </Link>
      )}

      {/* シフトの回答状況 */}
      {(pendingShifts > 0 || declinedShifts > 0) && (
        <Link href="/calendar" className="block">
          <div className="flex gap-2">
            {pendingShifts > 0 && (
              <span className="flex-1 text-center px-3 py-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-sm font-semibold">
                未回答のシフト {pendingShifts}件
              </span>
            )}
            {declinedShifts > 0 && (
              <span className="flex-1 text-center px-3 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200 text-sm font-semibold">
                辞退 {declinedShifts}件 → 再割当
              </span>
            )}
          </div>
        </Link>
      )}

      {/* 今日・明日のチェックイン。清掃の漏れを防ぐため一番上に置く */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-bold text-slate-900">チェックイン</h2>
          <Link href="/calendar" className="text-xs font-semibold text-blue-600">
            カレンダーで見る →
          </Link>
        </div>
        <div className="space-y-4">
          <CheckInDay label="今日" day={checkIns.today} propertyMap={propertyMap} />
          <CheckInDay label="明日" day={checkIns.tomorrow} propertyMap={propertyMap} />
        </div>
      </Card>

      {/* 今日の予定 */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-bold text-slate-900">今日の予定</h2>
          <span className="text-2xl font-bold text-blue-600">
            {guestsToday}名
          </span>
        </div>

        {activeToday.length === 0 ? (
          <p className="text-sm text-slate-400">本日の予定はありません</p>
        ) : (
          <ul className="space-y-1.5">
            {activeToday.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-slate-50"
              >
                <span className="flex items-center gap-2 font-semibold text-slate-700">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        typeMap.get(r.typeId)?.color ?? '#94a3b8',
                    }}
                  />
                  {typeMap.get(r.typeId)?.icon}{' '}
                  {propertyMap.get(r.propertyId)?.name ?? '棟不明'}
                </span>
                <span className="text-slate-500">
                  {typeMap.get(r.typeId)?.name}
                  {typeMap.get(r.typeId)?.hasGuests !== false &&
                    r.guestCount > 0 &&
                    ` / ${r.guestCount}名`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 今月の人件費 */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-bold text-slate-900">今月の人件費</h2>
          <span className="text-2xl font-bold text-slate-900">
            {formatYen(grandTotal)}
          </span>
        </div>

        {salaries.length === 0 ? (
          <p className="text-sm text-slate-400">まだ勤務記録がありません</p>
        ) : (
          <ul className="space-y-1.5">
            {salaries.map((row) => (
              <li
                key={row.user.id}
                className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-slate-50"
              >
                <span className="font-semibold text-slate-700 truncate">
                  {row.user.name || row.user.email}
                </span>
                <span className="text-slate-600 tabular-nums shrink-0 ml-2">
                  {row.salary.days.length}日 / {formatYen(row.salary.totalAmount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* メニュー */}
      <div className="grid grid-cols-2 gap-3">
        {MENU.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="p-4 h-full hover:border-blue-300 transition-colors">
              <span className="text-2xl" aria-hidden>
                {item.icon}
              </span>
              <p className="font-bold text-slate-900 mt-2 text-sm">
                {item.label}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CheckInDay({
  label,
  day,
  propertyMap,
}: {
  label: string;
  day: { date: string; items: CheckInItem[] };
  propertyMap: Map<string, Property>;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-1.5">
        <h3 className="text-sm font-bold text-slate-800">{label}</h3>
        <span className="text-xs text-slate-400">{formatDateJa(day.date)}</span>
        <span className="ml-auto text-sm font-bold text-blue-600">
          {day.items.length}件
        </span>
      </div>

      {day.items.length === 0 ? (
        <p className="text-sm text-slate-400 px-3 py-2 rounded-lg bg-slate-50">
          チェックインはありません
        </p>
      ) : (
        <ul className="space-y-1.5">
          {day.items.map(({ stay, cleaning, isTurnover }) => {
            const property = propertyMap.get(stay.propertyId);
            const badge = CLEANING_BADGE[cleaning];
            return (
              <li
                key={stay.id}
                className="flex items-center gap-2 text-sm px-3 py-2.5 rounded-lg bg-slate-50 border-l-4"
                style={{ borderLeftColor: property?.color ?? '#94a3b8' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 truncate">
                    {property?.name ?? '棟不明'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {stay.guestCount ? (
                      `${stay.guestCount}名`
                    ) : (
                      <span className="px-1 rounded border border-dashed border-slate-400">
                        人数未記入
                      </span>
                    )}
                    <span className="ml-2">〜 {formatDateJa(stay.checkOut)}</span>
                    {isTurnover && (
                      <span className="ml-2 font-semibold text-amber-700">入れ替え</span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-lg border ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  {/* 人数は iCal に無いので、Airbnb の予約ページで確かめてもらう */}
                  {airbnbReservationUrl(stay.reservationCode) && (
                    <a
                      href={airbnbReservationUrl(stay.reservationCode) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-rose-600"
                    >
                      Airbnb で開く ↗
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
