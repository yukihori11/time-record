'use client';

import { useState } from 'react';
import { formatMonthJa } from '@/app/lib/domain/datetime';
import { formatDuration, formatYen } from '@/app/lib/domain/format';
import { Card } from '@/app/components/ui/Feedback';
import type { AnalyticsData, MonthAnalytics } from './types';

// 量を表す色は青1色に揃える。棟の見分けは色ではなく、棟名の文字と左の丸で付ける
const BAR = '#2563eb';
const BAR_MUTED = '#bfdbfe';

function pct(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/** 全棟まとめた稼働率。売り出していた泊数の合計で割る */
function totalOccupancy(m: MonthAnalytics): number | null {
  const booked = m.perProperty.reduce((s, p) => s + p.occupancy.bookedNights, 0);
  const available = m.perProperty.reduce((s, p) => s + p.occupancy.availableNights, 0);
  return available > 0 ? Math.min(1, booked / available) : null;
}

/** 「11月」のような短い月の表記 */
function shortMonth(month: string): string {
  return `${Number(month.slice(5))}月`;
}

export default function AnalyticsView({ data }: { data: AnalyticsData }) {
  const [month, setMonth] = useState(data.currentMonth);
  const index = data.months.indexOf(month);
  const current = data.byMonth[index];
  const previous = index > 0 ? data.byMonth[index - 1] : null;
  const propertyMap = new Map(data.properties.map((p) => [p.id, p]));

  // 宿泊を取り込む前の月は、0% ではなく「データ無し」として扱う
  const hasStayData = (m: string) => data.firstStayMonth !== null && m >= data.firstStayMonth;

  const occ = hasStayData(month) ? totalOccupancy(current) : null;
  const prevOcc = previous && hasStayData(previous.month) ? totalOccupancy(previous) : null;

  return (
    <div className="space-y-4">
      {data.warnings.map((w) => (
        <div
          key={w}
          className="px-3 py-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold"
        >
          ⚠ {w}
        </div>
      ))}

      {/* 月の選択 */}
      <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-slate-200 px-2 py-2">
        <button
          onClick={() => index > 0 && setMonth(data.months[index - 1])}
          disabled={index <= 0}
          className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold disabled:opacity-30"
          aria-label="前の月"
        >
          ‹
        </button>
        <span className="font-bold text-slate-900">
          {formatMonthJa(month)}
          {current.isFuture && (
            <span className="ml-2 text-xs font-semibold text-slate-400">（予約済みの分）</span>
          )}
        </span>
        <button
          onClick={() => index < data.months.length - 1 && setMonth(data.months[index + 1])}
          disabled={index >= data.months.length - 1}
          className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold disabled:opacity-30"
          aria-label="次の月"
        >
          ›
        </button>
      </div>

      {/* その月の要点 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="稼働率（全棟）"
          value={pct(occ)}
          delta={occ !== null && prevOcc !== null ? `${diffSign(Math.round((occ - prevOcc) * 100))}pt` : null}
          note={!hasStayData(month) ? '取り込み前の月' : undefined}
        />
        <StatTile
          label="人件費"
          value={current.laborTotal === null ? '—' : formatYen(current.laborTotal)}
          delta={
            current.laborTotal !== null && previous?.laborTotal != null
              ? `${diffSign(current.laborTotal - previous.laborTotal, true)}`
              : null
          }
          note={current.isFuture ? '先の月' : undefined}
        />
        <StatTile label="清掃の回数" value={`${current.cleanings}回`} />
        <StatTile
          label="清掃1回あたり人件費"
          value={current.laborPerCleaning === null ? '—' : formatYen(Math.round(current.laborPerCleaning))}
          note={current.cleanings === 0 && !current.isFuture ? '清掃の予定が無い月' : '人件費 ÷ 清掃の回数'}
        />
      </div>

      {/* 棟ごとの稼働率（その月） */}
      <Card className="p-5">
        <SectionHead
          title="棟ごとの稼働率"
          hint="予約で埋まった泊数 ÷ 売り出していた泊数（ブロックは除く）"
        />
        {!hasStayData(month) ? (
          <Empty>この月は Airbnb の宿泊を取り込む前のため、データがありません</Empty>
        ) : (
          <ul className="space-y-2.5">
            {current.perProperty.map(({ propertyId, occupancy: o }) => {
              const p = propertyMap.get(propertyId);
              const width = o.rate === null ? 0 : Math.max(o.rate * 100, o.rate > 0 ? 1.5 : 0);
              return (
                <li key={propertyId}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-700 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p?.color }} />
                      <span className="truncate">{p?.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500 text-xs">
                      <span className="text-base font-bold text-slate-900 mr-1.5">{pct(o.rate)}</span>
                      {o.bookedNights}/{o.availableNights}泊
                      {o.blockedNights > 0 && <span className="ml-1">（ブロック{o.blockedNights}）</span>}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-2.5 rounded bg-slate-100 overflow-hidden"
                    title={`${p?.name}：${pct(o.rate)}（${o.bookedNights}/${o.availableNights}泊）`}
                  >
                    <div className="h-full rounded" style={{ width: `${width}%`, backgroundColor: BAR }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 稼働率の推移（棟 × 月） */}
      <Card className="p-5">
        <SectionHead title="稼働率の推移" hint="色が濃いほど埋まっている。押すとその月を選ぶ" />
        <OccupancyHeatmap data={data} selected={month} onSelect={setMonth} hasStayData={hasStayData} />
      </Card>

      {/* 人件費の推移 */}
      <Card className="p-5">
        <SectionHead title="人件費の推移" hint="給与集計と同じ計算。押すとその月を選ぶ" />
        <LaborChart data={data} selected={month} onSelect={setMonth} />

        <h3 className="mt-5 mb-2 text-xs font-bold text-slate-500">
          {formatMonthJa(month)}のスタッフ別
        </h3>
        {current.isFuture ? (
          <Empty>先の月の人件費はまだありません</Empty>
        ) : current.laborByStaff.length === 0 ? (
          <Empty>この月の勤務記録はありません</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-200">
                  <th className="text-left font-semibold py-1.5">スタッフ</th>
                  <th className="text-right font-semibold py-1.5">日数</th>
                  <th className="text-right font-semibold py-1.5">時間</th>
                  <th className="text-right font-semibold py-1.5">金額</th>
                </tr>
              </thead>
              <tbody>
                {[...current.laborByStaff]
                  .sort((a, b) => b.amount - a.amount)
                  .map((r) => (
                    <tr key={r.userId} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 font-semibold text-slate-700">
                        {r.name}
                        {r.missingWageDays > 0 && (
                          <span className="ml-1.5 text-[11px] font-bold text-amber-700">
                            ⚠ 時給未設定 {r.missingWageDays}日
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{r.days}日</td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{formatDuration(r.workMs)}</td>
                      <td className="py-2 text-right tabular-nums font-bold text-slate-900">{formatYen(r.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 予約の傾向（その月） */}
      <Card className="p-5">
        <SectionHead title="予約の傾向" hint="その月にチェックインした予約で集計" />
        {!hasStayData(month) ? (
          <Empty>この月は Airbnb の宿泊を取り込む前のため、データがありません</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-200">
                  <th className="text-left font-semibold py-1.5">棟</th>
                  <th className="text-right font-semibold py-1.5">予約</th>
                  <th className="text-right font-semibold py-1.5">平均泊数</th>
                  <th className="text-right font-semibold py-1.5" title="前の客が出た日に次の客が入った回数">
                    入れ替え
                  </th>
                </tr>
              </thead>
              <tbody>
                {current.perProperty.map(({ propertyId, stats }) => {
                  const p = propertyMap.get(propertyId);
                  return (
                    <tr key={propertyId} className="border-b border-slate-100 last:border-0">
                      <td className="py-2">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p?.color }} />
                          {p?.name}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{stats.checkIns}件</td>
                      <td className="py-2 text-right tabular-nums font-bold text-slate-900">
                        {stats.avgNights === null ? '—' : `${stats.avgNights.toFixed(1)}泊`}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{stats.turnovers}回</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-[11px] text-slate-400 leading-relaxed px-1">
        宿泊は Airbnb のカレンダーから取り込んだ分だけが元になります。
        {data.firstStayMonth && `取り込んだ宿泊は ${formatMonthJa(data.firstStayMonth)} からです。`}
        Airbnb のカレンダーには金額が含まれないため、売上は表示していません。
      </p>
    </div>
  );
}

/** 増減に符号を付ける。金額なら円の表記にする */
function diffSign(n: number, yen = false): string {
  const body = yen ? formatYen(Math.abs(n)) : String(Math.abs(n));
  if (n > 0) return `+${body}`;
  if (n < 0) return `−${body}`;
  return `±${body}`;
}

function StatTile({
  label,
  value,
  delta,
  note,
}: {
  label: string;
  value: string;
  delta?: string | null;
  note?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {delta ? (
        <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">前月比 {delta}</p>
      ) : (
        note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>
      )}
    </Card>
  );
}

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-bold text-slate-900">{title}</h2>
      <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400 px-3 py-2 rounded-lg bg-slate-50">{children}</p>;
}

/**
 * 棟 × 月の稼働率。数字を必ず書き、色の濃さは補助にする
 * （色だけで読ませない）。
 */
function OccupancyHeatmap({
  data,
  selected,
  onSelect,
  hasStayData,
}: {
  data: AnalyticsData;
  selected: string;
  onSelect: (m: string) => void;
  hasStayData: (m: string) => boolean;
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white z-10" />
            {data.months.map((m, i) => (
              <th
                key={m}
                className={`px-0.5 pb-1 font-semibold tabular-nums whitespace-nowrap ${
                  m === selected ? 'text-blue-700' : m > data.currentMonth ? 'text-slate-300' : 'text-slate-400'
                }`}
              >
                {/* 年が変わるところだけ年を出す */}
                {(i === 0 || m.endsWith('-01')) && (
                  <span className="block text-[9px] font-normal">{m.slice(0, 4)}</span>
                )}
                {shortMonth(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.properties.map((p) => (
            <tr key={p.id}>
              <th className="sticky left-0 bg-white z-10 pr-2 text-left font-semibold text-slate-700 whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5 max-w-[7rem]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="truncate">{p.name}</span>
                </span>
              </th>
              {data.byMonth.map((m) => {
                const o = m.perProperty.find((x) => x.propertyId === p.id)?.occupancy;
                const rate = hasStayData(m.month) ? (o?.rate ?? null) : null;
                const strong = rate !== null && rate >= 0.55;
                return (
                  <td key={m.month} className="p-0">
                    <button
                      onClick={() => onSelect(m.month)}
                      className={`w-11 h-8 rounded text-[11px] font-bold tabular-nums ${
                        m.month === selected ? 'ring-2 ring-slate-900' : ''
                      } ${rate === null ? 'text-slate-300 bg-slate-50' : strong ? 'text-white' : 'text-slate-700'}`}
                      style={
                        rate === null
                          ? undefined
                          : { backgroundColor: `rgba(37, 99, 235, ${0.08 + rate * 0.82})` }
                      }
                      title={`${p.name} ${formatMonthJa(m.month)}：${pct(rate)}${
                        o ? `（${o.bookedNights}/${o.availableNights}泊）` : ''
                      }`}
                    >
                      {pct(rate)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 月ごとの人件費の縦棒。選んだ月と、指を置いた月の金額を出す */
function LaborChart({
  data,
  selected,
  onSelect,
}: {
  data: AnalyticsData;
  selected: string;
  onSelect: (m: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const rows = data.byMonth.filter((m) => !m.isFuture);
  const max = Math.max(1, ...rows.map((m) => m.laborTotal ?? 0));
  const focus = hover ?? selected;
  const focusRow = rows.find((m) => m.month === focus);
  const H = 140;

  return (
    <div>
      {/* 指を置いた月（無ければ選んだ月）の値。棒の上に毎回数字を並べると読みにくいので1か所に出す */}
      <p className="text-xs text-slate-500 mb-2 h-4 tabular-nums">
        {focusRow && (
          <>
            {formatMonthJa(focusRow.month)}：
            <span className="font-bold text-slate-900">{formatYen(focusRow.laborTotal ?? 0)}</span>
          </>
        )}
      </p>
      <div className="relative" style={{ height: H }}>
        {/* 目安の線。上端の値だけ書く */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-200" />
        <span className="absolute right-0 -top-4 text-[10px] text-slate-400 tabular-nums">
          {formatYen(max)}
        </span>
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-300" />

        <div className="absolute inset-0 flex items-end gap-0.5">
          {rows.map((m) => {
            const value = m.laborTotal ?? 0;
            const h = (value / max) * H;
            const isSel = m.month === selected;
            return (
              <button
                key={m.month}
                onClick={() => onSelect(m.month)}
                onMouseEnter={() => setHover(m.month)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(m.month)}
                onBlur={() => setHover(null)}
                className="flex-1 h-full flex items-end justify-center"
                aria-label={`${formatMonthJa(m.month)} ${formatYen(value)}`}
              >
                <span
                  className="block w-full max-w-[28px] rounded-t"
                  style={{
                    height: value > 0 ? Math.max(h, 2) : 0,
                    backgroundColor: isSel || m.month === hover ? BAR : BAR_MUTED,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-0.5 mt-1">
        {rows.map((m) => (
          <span
            key={m.month}
            className={`flex-1 text-center text-[10px] tabular-nums ${
              m.month === selected ? 'font-bold text-slate-900' : 'text-slate-400'
            }`}
          >
            {shortMonth(m.month)}
          </span>
        ))}
      </div>
    </div>
  );
}
