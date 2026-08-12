'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MonthlySalary, PayrollSettings } from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { formatDateJa } from '@/app/lib/domain/datetime';
import { formatDuration, formatMinutes, formatYen } from '@/app/lib/domain/format';
import MonthNav from '@/app/components/MonthNav';
import { Card, EmptyState, ErrorBanner, Spinner } from '@/app/components/ui/Feedback';

interface Props {
  initialMonth: string;
  initialSalary: MonthlySalary;
  initialSettings: PayrollSettings;
}

export default function SalaryView({
  initialMonth,
  initialSalary,
  initialSettings,
}: Props) {
  const [month, setMonth] = useState(initialMonth);
  const [salary, setSalary] = useState<MonthlySalary | null>(initialSalary);
  const [settings, setSettings] = useState<PayrollSettings | null>(
    initialSettings
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);

  const load = useCallback(async (targetMonth: string) => {
    setLoading(true);
    try {
      const data = await api.get<{
        salary: MonthlySalary;
        settings: PayrollSettings;
      }>(`/api/salary?month=${targetMonth}`);
      setSalary(data.salary);
      setSettings(data.settings);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // 月を切り替えたら取りに行く。
  //
  // 初期表示の月だけは、すでにサーバーで取得した分があるので
  // 一度目は通信を省く。ただし戻ってきたときは取り直す。
  //
  // 以前はここで単に return していたため、他の月へ移ったあと
  // 戻ると他の月の金額が残ったままになっていた。
  // 管理者が勤務時間を直した場合にも、戻れば反映される。
  const visited = useRef(false);

  useEffect(() => {
    if (month === initialMonth && !visited.current) {
      visited.current = true;
      return;
    }
    visited.current = true;
    void load(month);
  }, [month, initialMonth, load]);

  return (
    <div className="space-y-4">
      <MonthNav month={month} onChange={setMonth} />

      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : !salary || salary.days.length === 0 ? (
        <EmptyState
          icon="📭"
          title="この月の勤務記録はありません"
          description="出勤すると記録がここに表示されます"
        />
      ) : (
        <>
          {/*
            月合計。
            Card は bg-white を持つため、className で背景色を渡しても
            打ち消せず、白地に白文字で金額が消える。
            配色が特殊なので Card を使わず直接組み立てる。
          */}
          <div className="p-6 rounded-2xl shadow-sm bg-blue-600">
            <p className="text-sm text-blue-100">今月の給与</p>
            <p className="text-4xl font-bold text-white mt-1 tabular-nums">
              {formatYen(salary.totalAmount)}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-5 pt-5 border-t border-blue-500">
              <div>
                <p className="text-xs text-blue-100">勤務日数</p>
                <p className="text-lg font-bold text-white">
                  {salary.days.length}日
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-100">実労働</p>
                <p className="text-lg font-bold text-white">
                  {formatDuration(salary.totalWorkMs)}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-100">休憩</p>
                <p className="text-lg font-bold text-white">
                  {formatDuration(salary.totalBreakMs)}
                </p>
              </div>
            </div>
          </div>

          {salary.missingWageDates.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
              時給が未設定の日があります（
              {salary.missingWageDates.length}日）。管理者にご確認ください。
            </div>
          )}

          {/* 日別 */}
          <div className="space-y-2">
            {salary.days.map((day) => {
              const open = openDate === day.workDate;
              return (
                <Card key={day.workDate} className="overflow-hidden">
                  <button
                    onClick={() => setOpenDate(open ? null : day.workDate)}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">
                        {formatDateJa(day.workDate)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDuration(day.actualWorkMs)}
                        {day.isGuaranteeApplied && (
                          <span className="ml-2 text-emerald-600 font-semibold">
                            最低保証
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-lg font-bold text-slate-900 tabular-nums">
                        {day.hourlyWage === null
                          ? '時給未設定'
                          : formatYen(day.amount)}
                      </p>
                      <span className="text-xs text-slate-400">
                        {open ? '閉じる' : '内訳'}
                      </span>
                    </div>
                  </button>

                  {open && (
                    <dl className="px-4 pb-4 pt-1 space-y-2 text-sm border-t border-slate-100 bg-slate-50">
                      <Row
                        label="実労働時間"
                        value={formatDuration(day.actualWorkMs)}
                      />
                      <Row label="休憩時間" value={formatDuration(day.breakMs)} />
                      <Row
                        label={`${settings?.roundingMinutes ?? 15}分単位で${
                          settings?.roundingMode === 'up' ? '切り上げ' : '切り捨て'
                        }`}
                        value={formatMinutes(day.roundedMinutes)}
                      />
                      {day.isGuaranteeApplied && (
                        <Row
                          label="最低保証"
                          value={formatMinutes(
                            settings?.minGuaranteedMinutes ?? 120
                          )}
                          highlight
                        />
                      )}
                      <Row
                        label="支給対象時間"
                        value={formatMinutes(day.billedMinutes)}
                      />
                      {day.hourlyWage !== null && (
                        <Row label="時給" value={formatYen(day.hourlyWage)} />
                      )}
                      <div className="flex justify-between pt-2 border-t border-slate-200">
                        <dt className="font-bold text-slate-700">支給額</dt>
                        <dd className="font-bold text-blue-600 tabular-nums">
                          {formatYen(day.amount)}
                        </dd>
                      </div>
                    </dl>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`tabular-nums ${
          highlight ? 'text-emerald-600 font-semibold' : 'text-slate-700'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
