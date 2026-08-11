'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { MonthlySalary, Property, Reservation } from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { todayJst } from '@/app/lib/domain/datetime';
import { formatYen } from '@/app/lib/domain/format';
import { isStaying } from '@/app/lib/domain/occupancy';
import { Card, ErrorBanner, Spinner } from '@/app/components/ui/Feedback';

interface SalaryRow {
  user: { id: string; name: string; email: string };
  salary: MonthlySalary;
}

const MENU = [
  { href: '/admin/shifts', label: 'シフト割当', icon: '📋', desc: 'スタッフに割り当て' },
  { href: '/admin/attendance', label: '勤怠管理', icon: '⏱', desc: '打刻の確認・修正' },
  { href: '/admin/wages', label: '時給設定', icon: '💰', desc: 'スタッフごとの時給' },
  { href: '/admin/salary', label: '給与集計', icon: '📊', desc: '月次の支給額' },
  { href: '/calendar', label: '予約カレンダー', icon: '📅', desc: '宿泊状況の管理' },
  { href: '/admin/settings', label: '設定', icon: '⚙', desc: '給与ルール・棟・権限' },
];

export default function AdminDashboard() {
  const [salaries, setSalaries] = useState<SalaryRow[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [staleCount, setStaleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const today = todayJst();
    const month = today.slice(0, 7);

    try {
      const [salaryRes, resRes, propRes, sessionRes] = await Promise.all([
        api.get<{ results: SalaryRow[]; grandTotal: number }>(
          `/api/admin/salary?month=${month}`
        ),
        api.get<{ reservations: Reservation[] }>(`/api/reservations?month=${month}`),
        api.get<{ properties: Property[] }>('/api/properties'),
        api.get<{ staleSessions: string[] }>(
          `/api/admin/sessions?from=${month}-01&to=${today}`
        ),
      ]);

      setSalaries(salaryRes.results);
      setGrandTotal(salaryRes.grandTotal);
      setReservations(resRes.reservations);
      setProperties(propRes.properties);
      setStaleCount(sessionRes.staleSessions.length);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayJst();
  const stayingToday = reservations.filter(
    (r) => r.status === 'confirmed' && isStaying(r, today)
  );
  const guestsToday = stayingToday.reduce((sum, r) => sum + r.guestCount, 0);
  const propertyMap = new Map(properties.map((p) => [p.id, p]));

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />

      {staleCount > 0 && (
        <Link href="/admin/attendance" className="block">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold">
            退勤が押されていない勤務が {staleCount} 件あります → 確認する
          </div>
        </Link>
      )}

      {/* 今日の宿泊状況 */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-bold text-slate-900">今日の宿泊</h2>
          <span className="text-2xl font-bold text-blue-600">
            {guestsToday}名
          </span>
        </div>

        {stayingToday.length === 0 ? (
          <p className="text-sm text-slate-400">本日の宿泊はありません</p>
        ) : (
          <ul className="space-y-1.5">
            {stayingToday.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-slate-50"
              >
                <span className="flex items-center gap-2 font-semibold text-slate-700">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        propertyMap.get(r.propertyId)?.color ?? '#94a3b8',
                    }}
                  />
                  {propertyMap.get(r.propertyId)?.name ?? '棟不明'}
                </span>
                <span className="text-slate-500">
                  {r.guestName || '—'} / {r.guestCount}名
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
