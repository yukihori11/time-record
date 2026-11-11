import Link from 'next/link';
import type {
  MonthlySalary,
  Property,
  ReservationType,
  Schedule,
  Shift,
} from '@/app/types/domain';
import { formatDateShort, todayJst } from '@/app/lib/domain/datetime';
import type { CheckInItem, CheckOutItem } from '@/app/lib/domain/stays';
import { airbnbReservationUrl } from '@/app/lib/domain/stays';
import { CLEANING_BADGE, GuestCount, MoveBadge, StayRange } from '@/app/components/StayBadges';
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
  /** 今日・明日の宿泊の出入り */
  stayDays: { date: string; checkIns: CheckInItem[]; checkOuts: CheckOutItem[] }[];
  users: { id: string; name: string; email: string }[];
}

const SHIFT_STATUS: Record<Shift['status'], { label: string; className: string }> = {
  accepted: { label: '承諾', className: 'text-emerald-700' },
  assigned: { label: '未回答', className: 'text-amber-700' },
  declined: { label: '辞退', className: 'text-red-500 line-through' },
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
    stayDays,
    users,
  } = initialData;

  const today = todayJst();
  // 予定は1日単位なので、その日の分を拾うだけ
  const activeToday = schedules.filter(
    (s) => s.status === 'confirmed' && s.scheduleDate === today
  );
  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  const typeMap = new Map(types.map((t) => [t.id, t]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const propertyOrder = new Map(properties.map((p, i) => [p.id, i]));

  // 棟の並び順に揃える（設定画面の順）
  const todaySchedules = [...activeToday].sort(
    (a, b) =>
      (propertyOrder.get(a.propertyId) ?? 99) - (propertyOrder.get(b.propertyId) ?? 99)
  );

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

      {/* 今日・明日の宿泊の出入り。清掃の漏れを防ぐため上に置く */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-bold text-slate-900">宿泊の出入り</h2>
          <Link href="/calendar" className="text-xs font-semibold text-blue-600">
            カレンダーで見る →
          </Link>
        </div>
        <div className="space-y-5">
          {stayDays.map((day, i) => (
            <StayDay
              key={day.date}
              label={i === 0 ? '今日' : '明日'}
              day={day}
              propertyMap={propertyMap}
            />
          ))}
        </div>
      </Card>

      {/* 今日の予定 */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-bold text-slate-900">
            今日の予定
            <span className="ml-2 text-xs font-normal text-slate-400">
              {formatDateShort(today)}
            </span>
          </h2>
          {guestsToday > 0 && (
            <span className="text-sm text-slate-500">
              宿泊 <span className="text-xl font-bold text-blue-600">{guestsToday}</span> 名
            </span>
          )}
        </div>

        {todaySchedules.length === 0 ? (
          <p className="text-sm text-slate-400 px-3 py-2 rounded-lg bg-slate-50">
            今日の予定はありません
          </p>
        ) : (
          <ul className="space-y-2">
            {todaySchedules.map((r) => {
              const type = typeMap.get(r.typeId);
              const property = propertyMap.get(r.propertyId);
              const staff = shifts.filter((sh) => sh.reservationId === r.id);
              return (
                <li
                  key={r.id}
                  className="px-3 py-2.5 rounded-lg bg-slate-50 border-l-4"
                  style={{ borderLeftColor: property?.color ?? '#94a3b8' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: type?.color ?? '#94a3b8' }}
                    >
                      {type?.icon} {type?.name ?? '予定'}
                    </span>
                    <span className="font-bold text-slate-800 truncate">
                      {property?.name ?? '棟不明'}
                    </span>
                    {type?.hasGuests !== false && r.guestCount > 0 && (
                      <span className="ml-auto shrink-0 text-sm font-semibold text-slate-600">
                        {r.guestCount}名
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {staff.length === 0 ? (
                      <span className="font-semibold text-red-500">担当なし</span>
                    ) : (
                      <>
                        担当：
                        {staff.map((sh, idx) => {
                          const u = userMap.get(sh.userId);
                          const st = SHIFT_STATUS[sh.status];
                          return (
                            <span key={sh.id} className={`font-semibold ${st.className}`}>
                              {idx > 0 && '、'}
                              {u?.name || u?.email || 'スタッフ'}
                              {sh.startTime && ` ${sh.startTime}〜`}
                              {sh.status !== 'accepted' && `（${st.label}）`}
                            </span>
                          );
                        })}
                      </>
                    )}
                  </p>
                </li>
              );
            })}
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

function StayDay({
  label,
  day,
  propertyMap,
}: {
  label: string;
  day: { date: string; checkIns: CheckInItem[]; checkOuts: CheckOutItem[] };
  propertyMap: Map<string, Property>;
}) {
  const empty = day.checkIns.length === 0 && day.checkOuts.length === 0;

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-bold text-slate-800">{label}</h3>
        <span className="text-xs text-slate-400">{formatDateShort(day.date)}</span>
        <span className="ml-auto flex gap-1.5 text-xs font-bold">
          <span className="text-orange-600">OUT {day.checkOuts.length}</span>
          <span className="text-slate-300">/</span>
          <span className="text-emerald-700">IN {day.checkIns.length}</span>
        </span>
      </div>

      {empty ? (
        <p className="text-sm text-slate-400 px-3 py-2 rounded-lg bg-slate-50">
          出入りはありません
        </p>
      ) : (
        // 1日の流れに合わせて、出る（午前）→ 入る（午後）の順に並べる
        <ul className="space-y-1.5">
          {day.checkOuts.map(({ stay, isTurnover }) => {
            const property = propertyMap.get(stay.propertyId);
            return (
              <li
                key={`out-${stay.id}`}
                className="flex items-center gap-2.5 text-sm px-2.5 py-2 rounded-lg bg-orange-50/60 border-l-4"
                style={{ borderLeftColor: property?.color ?? '#94a3b8' }}
              >
                <MoveBadge kind="out" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 truncate">
                    {property?.name ?? '棟不明'}
                    {isTurnover && (
                      <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        同日に次の客
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    <StayRange stay={stay} />
                  </p>
                </div>
              </li>
            );
          })}

          {day.checkIns.map(({ stay, cleaning, isTurnover }) => {
            const property = propertyMap.get(stay.propertyId);
            const badge = CLEANING_BADGE[cleaning];
            const url = airbnbReservationUrl(stay.reservationCode);
            return (
              <li
                key={`in-${stay.id}`}
                className="flex items-center gap-2.5 text-sm px-2.5 py-2 rounded-lg bg-emerald-50/60 border-l-4"
                style={{ borderLeftColor: property?.color ?? '#94a3b8' }}
              >
                <MoveBadge kind="in" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 truncate">
                    {property?.name ?? '棟不明'}
                    <span className="ml-2 text-xs">
                      <GuestCount count={stay.guestCount} />
                    </span>
                    {isTurnover && (
                      <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        入れ替え
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    <StayRange stay={stay} />
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${badge.className}`}
                  >
                    {badge.icon} {badge.label}
                  </span>
                  {/* 人数は iCal に無いので、Airbnb の予約ページで確かめてもらう */}
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-rose-600"
                    >
                      Airbnb ↗
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
