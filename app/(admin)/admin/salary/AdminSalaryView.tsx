'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MonthlySalary } from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { formatDateJa, todayJst } from '@/app/lib/domain/datetime';
import { formatDuration, formatYen } from '@/app/lib/domain/format';
import MonthNav from '@/app/components/MonthNav';
import Button from '@/app/components/ui/Button';
import {
  Card,
  EmptyState,
  ErrorBanner,
  Spinner,
} from '@/app/components/ui/Feedback';

interface Row {
  user: { id: string; name: string; email: string };
  salary: MonthlySalary;
}

export default function AdminSalaryView() {
  const [month, setMonth] = useState(() => todayJst().slice(0, 7));
  const [rows, setRows] = useState<Row[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);

  const load = useCallback(async (targetMonth: string) => {
    setLoading(true);
    try {
      const data = await api.get<{ results: Row[]; grandTotal: number }>(
        `/api/admin/salary?month=${targetMonth}`
      );
      setRows(data.results);
      setGrandTotal(data.grandTotal);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

  return (
    <div className="space-y-4">
      <MonthNav month={month} onChange={setMonth} />

      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState icon="📊" title="この月の勤務記録はありません" />
      ) : (
        <>
          <Card className="p-5 bg-slate-900 border-slate-900">
            <p className="text-sm text-slate-300">人件費の合計</p>
            <p className="text-3xl font-bold text-white mt-1 tabular-nums">
              {formatYen(grandTotal)}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              {rows.length}名 / 延べ
              {rows.reduce((sum, r) => sum + r.salary.days.length, 0)}日
            </p>
          </Card>

          <a
            href={`/api/admin/salary?month=${month}&format=csv`}
            download
            className="block"
          >
            <Button variant="secondary" fullWidth>
              CSVをダウンロード
            </Button>
          </a>

          <ul className="space-y-2">
            {rows.map((row) => {
              const open = openUser === row.user.id;
              return (
                <Card key={row.user.id} className="overflow-hidden">
                  <button
                    onClick={() => setOpenUser(open ? null : row.user.id)}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">
                        {row.user.name || row.user.email}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {row.salary.days.length}日 /{' '}
                        {formatDuration(row.salary.totalWorkMs)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-lg font-bold text-slate-900 tabular-nums">
                        {formatYen(row.salary.totalAmount)}
                      </p>
                      <span className="text-xs text-slate-400">
                        {open ? '閉じる' : '日別'}
                      </span>
                    </div>
                  </button>

                  {open && (
                    <ul className="border-t border-slate-100 bg-slate-50 px-4 py-2">
                      {row.salary.days.map((day) => (
                        <li
                          key={day.workDate}
                          className="flex justify-between py-1.5 text-sm"
                        >
                          <span className="text-slate-600">
                            {formatDateJa(day.workDate)}
                            {day.isGuaranteeApplied && (
                              <span className="ml-1.5 text-xs text-emerald-600">
                                保証
                              </span>
                            )}
                          </span>
                          <span className="text-slate-700 tabular-nums">
                            {formatDuration(day.actualWorkMs)} /{' '}
                            {formatYen(day.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {row.salary.missingWageDates.length > 0 && (
                    <p className="px-4 py-2 text-xs text-amber-600 bg-amber-50 border-t border-amber-100">
                      時給未設定の日が{row.salary.missingWageDates.length}
                      日あります
                    </p>
                  )}
                </Card>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
