'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addDays,
  diffDays,
  formatDateShort,
  formatMonthJa,
  monthRange,
  todayJst,
} from '@/app/lib/domain/datetime';
import { formatDuration, formatYen } from '@/app/lib/domain/format';
import { Card } from '@/app/components/ui/Feedback';
import Button from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Field';
import type { AnalyticsData, Summary } from './types';

// 量を表す色は青1色に揃える。棟の見分けは色ではなく、棟名の文字と左の丸で付ける
const BAR = '#2563eb';
const BAR_MUTED = '#bfdbfe';
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

type Tab = 'overview' | 'occupancy' | 'revenue' | 'cleaning' | 'staff';
const TABS: [Tab, string][] = [
  ['overview', '概要'],
  ['occupancy', '稼働'],
  ['revenue', '売上'],
  ['cleaning', '清掃'],
  ['staff', 'スタッフ'],
];

function pct(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
}

function yen(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : formatYen(Math.round(n));
}

function hours(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? '—' : formatDuration(ms);
}

/** 全棟まとめた稼働率。売り出していた泊数の合計で割る */
function totalOccupancy(m: Summary): number | null {
  const booked = m.perProperty.reduce((s, p) => s + p.occupancy.bookedNights, 0);
  const available = m.perProperty.reduce((s, p) => s + p.occupancy.availableNights, 0);
  return available > 0 ? Math.min(1, booked / available) : null;
}

function shortMonth(month: string): string {
  return `${Number(month.slice(5))}月`;
}

/** 増減に符号を付ける。金額なら円の表記にする */
function diffSign(n: number, yenFormat = false): string {
  const body = yenFormat ? formatYen(Math.abs(Math.round(n))) : String(Math.abs(n));
  if (n > 0) return `+${body}`;
  if (n < 0) return `−${body}`;
  return `±${body}`;
}

/** 選んだ期間の集計と、比べる相手（月ごとなら前月） */
interface Selection {
  summary: Summary;
  previous: Summary | null;
  label: string;
  hasStayData: boolean;
  partialStayData: boolean;
  /** 月ごとの表示で選んでいる月。期間指定なら null */
  month: string | null;
}

export default function AnalyticsView({ data }: { data: AnalyticsData }) {
  const [mode, setMode] = useState<'month' | 'range'>(data.range || data.rangeError ? 'range' : 'month');
  const [month, setMonth] = useState(data.currentMonth);
  const [tab, setTab] = useState<Tab>('overview');

  // 宿泊を取り込む前の月は、0% ではなく「データ無し」として扱う
  const hasStayDataForMonth = (m: string) =>
    data.firstStayDate !== null && monthRange(m).to >= data.firstStayDate;

  let selection: Selection | null = null;
  if (mode === 'month') {
    const index = data.months.indexOf(month);
    const previous = index > 0 ? data.byMonth[index - 1] : null;
    selection = {
      summary: data.byMonth[index],
      previous: previous && hasStayDataForMonth(previous.month) ? previous : null,
      label: formatMonthJa(month),
      hasStayData: hasStayDataForMonth(month),
      partialStayData: false,
      month,
    };
  } else if (data.range) {
    const r = data.range;
    const has = data.firstStayDate !== null && r.to >= data.firstStayDate;
    selection = {
      summary: r,
      previous: null,
      label: `${formatDateShort(r.from)}〜${formatDateShort(r.to)}`,
      hasStayData: has,
      partialStayData: has && data.firstStayDate !== null && r.from < data.firstStayDate,
      month: null,
    };
  }

  const selectMonth = (m: string) => {
    setMode('month');
    setMonth(m);
  };

  return (
    <div className="space-y-4">
      {data.warnings.map((w) => (
        <Notice key={w} tone="amber">⚠ {w}</Notice>
      ))}

      {/* 集計する期間 */}
      <div className="space-y-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            ['month', '月ごと'],
            ['range', '期間を指定'],
          ]}
        />
        {mode === 'month' ? (
          <MonthPicker data={data} month={month} onChange={setMonth} />
        ) : (
          <RangePicker data={data} />
        )}
      </div>

      {selection && (
        <>
          {/* 見るもの。横に送れるタブ。スクロールしても上に残す */}
          <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-slate-50/95 backdrop-blur border-b border-slate-200">
            <div role="tablist" aria-label="分析の種類" className="flex gap-1 overflow-x-auto">
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                    tab === key
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {selection.partialStayData && (
            <Notice tone="amber">⚠ 期間の一部が、Airbnb の宿泊を取り込む前です。稼働率は低めに出ます。</Notice>
          )}

          {tab === 'overview' && <OverviewTab data={data} sel={selection} onGo={setTab} />}
          {tab === 'occupancy' && <OccupancyTab data={data} sel={selection} onSelectMonth={selectMonth} />}
          {tab === 'revenue' && <RevenueTab data={data} sel={selection} />}
          {tab === 'cleaning' && <CleaningTab data={data} sel={selection} />}
          {tab === 'staff' && <StaffTab data={data} sel={selection} onSelectMonth={selectMonth} />}
        </>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed px-1">
        宿泊は Airbnb のカレンダーから取り込んだ分だけが元になります。
        {data.firstStayDate && `取り込んだ宿泊は ${formatDateShort(data.firstStayDate)} からです。`}
        売上は、カレンダーの宿泊の詳細で入力した金額だけを数えます。
      </p>
    </div>
  );
}

// ============================================================
// 期間の選び方
// ============================================================

function MonthPicker({
  data,
  month,
  onChange,
}: {
  data: AnalyticsData;
  month: string;
  onChange: (m: string) => void;
}) {
  const index = data.months.indexOf(month);
  const isFuture = month > data.currentMonth;
  return (
    <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-slate-200 px-2 py-2">
      <button
        onClick={() => index > 0 && onChange(data.months[index - 1])}
        disabled={index <= 0}
        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold disabled:opacity-30"
        aria-label="前の月"
      >
        ‹
      </button>
      <span className="font-bold text-slate-900">
        {formatMonthJa(month)}
        {isFuture && <span className="ml-2 text-xs font-semibold text-slate-400">（予約済みの分）</span>}
      </span>
      <button
        onClick={() => index < data.months.length - 1 && onChange(data.months[index + 1])}
        disabled={index >= data.months.length - 1}
        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold disabled:opacity-30"
        aria-label="次の月"
      >
        ›
      </button>
    </div>
  );
}

/**
 * 期間の指定（10/15〜11/15 など）。
 * 集計はサーバーで行うので、日付を決めたら URL に入れて読み込み直す。
 */
function RangePicker({ data }: { data: AnalyticsData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const today = todayJst();
  const [from, setFrom] = useState(data.range?.from ?? addDays(today, -30));
  const [to, setTo] = useState(data.range?.to ?? today);
  const invalid = !from || !to || from > to;

  const apply = (f: string, t: string) => {
    startTransition(() => router.push(`/admin/analytics?from=${f}&to=${t}`, { scroll: false }));
  };

  const prevMonth = addDays(monthRange(today.slice(0, 7)).from, -1).slice(0, 7);
  const presets: [string, string, string][] = [
    ['直近30日', addDays(today, -29), today],
    ['直近90日', addDays(today, -89), today],
    ['先月15日〜今月15日', `${prevMonth}-15`, `${today.slice(0, 7)}-15`],
  ];

  return (
    <Card className="p-4 space-y-3">
      <form
        className="grid grid-cols-[1fr_auto_1fr] items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) apply(from, to);
        }}
      >
        <label className="min-w-0">
          <span className="block text-xs font-bold text-slate-500 mb-1">開始日</span>
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <span className="pb-3 text-slate-400">〜</span>
        <label className="min-w-0">
          <span className="block text-xs font-bold text-slate-500 mb-1">終了日</span>
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="col-span-3">
          <Button type="submit" size="md" fullWidth loading={pending} disabled={invalid}>
            集計する
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([label, f, t]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setFrom(f);
              setTo(t);
              apply(f, t);
            }}
            className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            {label}
          </button>
        ))}
      </div>
      {data.range && (
        <p className={`text-xs font-semibold text-slate-600 ${pending ? 'opacity-50' : ''}`}>
          集計中：{formatDateShort(data.range.from)} 〜 {formatDateShort(data.range.to)}（
          {diffDays(data.range.from, data.range.to) + 1}日間）
        </p>
      )}
      {data.rangeError && <Notice tone="red">{data.rangeError}</Notice>}
      {!data.range && !data.rangeError && (
        <p className="text-[11px] text-slate-400">開始日と終了日の両方を含めて集計します（最長1年）。</p>
      )}
    </Card>
  );
}

// ============================================================
// 概要
// ============================================================

function OverviewTab({ data, sel, onGo }: { data: AnalyticsData; sel: Selection; onGo: (t: Tab) => void }) {
  const s = sel.summary;
  const occ = sel.hasStayData ? totalOccupancy(s) : null;
  const prevOcc = sel.previous ? totalOccupancy(sel.previous) : null;
  const next30 = data.forward[0];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile
          label="稼働率（全棟）"
          value={pct(occ)}
          delta={occ !== null && prevOcc !== null ? `${diffSign(Math.round((occ - prevOcc) * 100))}pt` : null}
          note={!sel.hasStayData ? '取り込み前' : undefined}
          onClick={() => onGo('occupancy')}
        />
        <StatTile
          label="売上（入力分）"
          value={data.revenueAvailable ? yen(s.revenueTotal) : '—'}
          delta={
            data.revenueAvailable && sel.previous
              ? diffSign(s.revenueTotal - sel.previous.revenueTotal, true)
              : null
          }
          note={!data.revenueAvailable ? '準備中' : undefined}
          onClick={() => onGo('revenue')}
        />
        <StatTile
          label="人件費"
          value={yen(s.laborTotal)}
          delta={
            s.laborTotal !== null && sel.previous?.laborTotal != null
              ? diffSign(s.laborTotal - sel.previous.laborTotal, true)
              : null
          }
          note={s.isFuture ? '先の期間' : undefined}
          onClick={() => onGo('staff')}
        />
        <StatTile label="人件費の割合" value={pct(s.laborRatio)} note="人件費 ÷ 売上" onClick={() => onGo('revenue')} />
        <StatTile
          label="清掃の回数"
          value={`${s.cleanings}回`}
          note="スタッフが入った清掃"
          onClick={() => onGo('cleaning')}
        />
        <StatTile
          label="この先30日の予約"
          value={pct(next30?.rate)}
          note={next30 ? `${formatDateShort(next30.from)}〜` : undefined}
          onClick={() => onGo('occupancy')}
        />
      </div>
      <p className="text-[11px] text-slate-400 px-1">数字を押すと、それぞれの詳しい分析に移ります。</p>
    </>
  );
}

// ============================================================
// 稼働
// ============================================================

function OccupancyTab({
  data,
  sel,
  onSelectMonth,
}: {
  data: AnalyticsData;
  sel: Selection;
  onSelectMonth: (m: string) => void;
}) {
  const s = sel.summary;
  const propertyMap = new Map(data.properties.map((p) => [p.id, p]));
  const hasStayDataForMonth = (m: string) =>
    data.firstStayDate !== null && monthRange(m).to >= data.firstStayDate;

  return (
    <>
      {/* 予約の先行き */}
      <Card className="p-5">
        <SectionHead title="予約の先行き" hint="今日から先、どれだけ予約が入っているか（選んだ月・期間に関係なく今日から）" />
        <div className="grid grid-cols-3 gap-2 mb-4">
          {data.forward.map((f) => (
            <div key={f.days} className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
              <p className="text-[11px] font-bold text-slate-500">{f.days}日先まで</p>
              <p className="text-xl font-bold text-slate-900 tabular-nums">{pct(f.rate)}</p>
            </div>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-200">
              <th className="text-left font-semibold py-1.5">棟</th>
              {data.forward.map((f) => (
                <th key={f.days} className="text-right font-semibold py-1.5">
                  {f.days}日
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.properties.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2">
                  <PropertyLabel p={p} />
                </td>
                {data.forward.map((f) => {
                  const o = f.perProperty.find((x) => x.propertyId === p.id)?.occupancy;
                  return (
                    <td key={f.days} className="py-2 text-right tabular-nums font-bold text-slate-900">
                      {pct(o?.rate)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 棟ごとの稼働率 */}
      <Card className="p-5">
        <SectionHead
          title={`棟ごとの稼働率（${sel.label}）`}
          hint="予約で埋まった泊数 ÷ 売り出していた泊数（ブロックは除く）"
        />
        {!sel.hasStayData ? (
          <Empty>Airbnb の宿泊を取り込む前のため、データがありません</Empty>
        ) : (
          <ul className="space-y-2.5">
            {s.perProperty.map(({ propertyId, occupancy: o }) => {
              const p = propertyMap.get(propertyId);
              return (
                <li key={propertyId}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    {p && <PropertyLabel p={p} />}
                    <span className="shrink-0 tabular-nums text-slate-500 text-xs">
                      <span className="text-base font-bold text-slate-900 mr-1.5">{pct(o.rate)}</span>
                      {o.bookedNights}/{o.availableNights}泊
                      {o.blockedNights > 0 && <span className="ml-1">（ブロック{o.blockedNights}）</span>}
                    </span>
                  </div>
                  <Meter rate={o.rate} title={`${p?.name}：${pct(o.rate)}`} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 曜日ごとの稼働 */}
      <Card className="p-5">
        <SectionHead
          title={`曜日ごとの稼働（${sel.label}）`}
          hint="その曜日の夜に泊まっている割合（全棟）。料金設定の手がかりに"
        />
        {!sel.hasStayData ? (
          <Empty>Airbnb の宿泊を取り込む前のため、データがありません</Empty>
        ) : (
          <WeekdayChart weekday={s.weekday} />
        )}
      </Card>

      {/* 人数あたりの稼働 */}
      <Card className="p-5">
        <SectionHead title={`宿泊人数（${sel.label}）`} hint="人数を入力した予約だけで集計。定員は設定画面の棟の定員" />
        {!sel.hasStayData ? (
          <Empty>Airbnb の宿泊を取り込む前のため、データがありません</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-200">
                  <th className="text-left font-semibold py-1.5">棟</th>
                  <th className="text-right font-semibold py-1.5">平均人数</th>
                  <th className="text-right font-semibold py-1.5">延べ人数</th>
                  <th className="text-right font-semibold py-1.5" title="延べ人数 ÷（定員 × 泊数）">
                    定員比
                  </th>
                  <th className="text-right font-semibold py-1.5">入力</th>
                </tr>
              </thead>
              <tbody>
                {s.perProperty.map(({ propertyId, guests: g }) => {
                  const p = propertyMap.get(propertyId);
                  return (
                    <tr key={propertyId} className="border-b border-slate-100 last:border-0">
                      <td className="py-2">{p && <PropertyLabel p={p} />}</td>
                      <td className="py-2 text-right tabular-nums font-bold text-slate-900">
                        {g.avgGuests === null ? '—' : `${g.avgGuests.toFixed(1)}名`}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{g.guestNights}人泊</td>
                      <td className="py-2 text-right tabular-nums text-slate-600">
                        {p?.capacity ? (
                          pct(g.capacityFill)
                        ) : (
                          <span className="text-[11px] text-slate-400">定員未設定</span>
                        )}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums text-xs ${
                          g.entered < g.checkIns ? 'text-amber-700 font-bold' : 'text-slate-500'
                        }`}
                      >
                        {g.entered}/{g.checkIns}件
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 予約の傾向 */}
      <Card className="p-5">
        <SectionHead title={`予約の傾向（${sel.label}）`} hint="期間内にチェックインした予約で集計" />
        {!sel.hasStayData ? (
          <Empty>Airbnb の宿泊を取り込む前のため、データがありません</Empty>
        ) : (
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
              {s.perProperty.map(({ propertyId, stats }) => {
                const p = propertyMap.get(propertyId);
                return (
                  <tr key={propertyId} className="border-b border-slate-100 last:border-0">
                    <td className="py-2">{p && <PropertyLabel p={p} />}</td>
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
        )}
      </Card>

      {/* 稼働率の推移 */}
      <Card className="p-5">
        <SectionHead title="稼働率の推移" hint="月ごと。色が濃いほど埋まっている。押すとその月を選ぶ" />
        <OccupancyHeatmap
          data={data}
          selected={sel.month}
          onSelect={onSelectMonth}
          hasStayData={hasStayDataForMonth}
        />
      </Card>
    </>
  );
}

// ============================================================
// 売上
// ============================================================

function RevenueTab({ data, sel }: { data: AnalyticsData; sel: Selection }) {
  const s = sel.summary;
  const propertyMap = new Map(data.properties.map((p) => [p.id, p]));

  if (!data.revenueAvailable) {
    return (
      <Card className="p-5 space-y-2">
        <h2 className="font-bold text-slate-900">売上の分析は準備中です</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          金額を保存する表がまだありません。マイグレーション
          <code className="mx-1 px-1 rounded bg-slate-100 text-xs">0031_stay_amounts.sql</code>
          を適用すると、カレンダーの宿泊の詳細で金額を入力できるようになり、ここに売上が出ます。
        </p>
      </Card>
    );
  }

  const nightsWithAmount = s.perProperty.reduce((sum, p) => sum + p.revenue.nightsWithAmount, 0);
  const bookedNights = s.perProperty.reduce((sum, p) => sum + p.revenue.bookedNights, 0);
  const availableNights = s.perProperty.reduce((sum, p) => sum + p.occupancy.availableNights, 0);
  const coverage = bookedNights > 0 ? nightsWithAmount / bookedNights : null;
  const adr = nightsWithAmount > 0 ? s.revenueTotal / nightsWithAmount : null;
  // 販売1泊あたりの売上。金額が全部入っているときだけ意味がある
  const revpar = coverage === 1 && availableNights > 0 ? s.revenueTotal / availableNights : null;

  return (
    <>
      {coverage !== null && coverage < 1 && (
        <Notice tone="amber">
          ⚠ 金額が入っているのは予約の泊数の {pct(coverage)} です。売上は入力した分だけなので、実際より少なく出ます。
          カレンダーで日付を押し、宿泊の「人数・金額・メモを入力」から入れてください。
        </Notice>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="売上"
          value={yen(s.revenueTotal)}
          delta={sel.previous ? diffSign(s.revenueTotal - sel.previous.revenueTotal, true) : null}
        />
        <StatTile label="平均単価（1泊）" value={yen(adr)} note="売上 ÷ 金額入力済みの泊数" />
        <StatTile
          label="販売1泊あたり売上"
          value={yen(revpar)}
          note={revpar === null ? '全予約の金額が入ると出ます' : '売上 ÷ 売り出していた泊数'}
        />
        <StatTile label="人件費の割合" value={pct(s.laborRatio)} note="人件費 ÷ 売上" />
      </div>

      <Card className="p-5">
        <SectionHead
          title={`棟ごとの売上（${sel.label}）`}
          hint="予約の金額を1泊あたりに割り、期間に入る泊数の分だけ数える"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-200">
                <th className="text-left font-semibold py-1.5">棟</th>
                <th className="text-right font-semibold py-1.5">売上</th>
                <th className="text-right font-semibold py-1.5">平均単価</th>
                <th className="text-right font-semibold py-1.5">入力</th>
              </tr>
            </thead>
            <tbody>
              {s.perProperty.map(({ propertyId, revenue: r }) => {
                const p = propertyMap.get(propertyId);
                return (
                  <tr key={propertyId} className="border-b border-slate-100 last:border-0">
                    <td className="py-2">{p && <PropertyLabel p={p} />}</td>
                    <td className="py-2 text-right tabular-nums font-bold text-slate-900">{yen(r.revenue)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{yen(r.adr)}</td>
                    <td
                      className={`py-2 text-right tabular-nums text-xs ${
                        r.nightsWithAmount < r.bookedNights ? 'text-amber-700 font-bold' : 'text-slate-500'
                      }`}
                    >
                      {r.nightsWithAmount}/{r.bookedNights}泊
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHead title="売上 − 人件費" hint="Airbnb の手数料・光熱費などは含まない" />
        {s.laborTotal === null ? (
          <Empty>先の期間の人件費はまだありません</Empty>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Figure label="売上" value={yen(s.revenueTotal)} />
            <Figure label="人件費" value={yen(s.laborTotal)} />
            <Figure label="差し引き" value={yen(s.revenueTotal - s.laborTotal)} strong />
          </div>
        )}
      </Card>
    </>
  );
}

// ============================================================
// 清掃
// ============================================================

function CleaningTab({ data, sel }: { data: AnalyticsData; sel: Selection }) {
  const s = sel.summary;
  const d = s.cleaningDuration;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="清掃の回数" value={`${s.cleanings}回`} note="承諾したスタッフがいる清掃" />
        <StatTile label="清掃1回あたり人件費" value={yen(s.laborPerCleaning)} note="人件費 ÷ 清掃の回数" />
        <StatTile label="1回の清掃（延べ時間）" value={hours(d?.avgPerCleaningMs)} note="2人なら2人分の合計" />
        <StatTile label="1人あたりの時間" value={hours(d?.avgPerPersonMs)} note="1回の清掃に1人がかけた時間" />
      </div>

      <Card className="p-5">
        <SectionHead title={`棟ごとの清掃時間（${sel.label}）`} hint="1回の清掃にかかった延べ時間の平均" />
        {!d || d.byProperty.length === 0 ? (
          <Empty>計算できる清掃がありません</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-200">
                <th className="text-left font-semibold py-1.5">棟</th>
                <th className="text-right font-semibold py-1.5">計算に使った回数</th>
                <th className="text-right font-semibold py-1.5">平均時間</th>
              </tr>
            </thead>
            <tbody>
              {data.properties.map((p) => {
                const row = d.byProperty.find((x) => x.propertyId === p.id);
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2">
                      <PropertyLabel p={p} />
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-600">
                      {row ? `${row.cleanings}回` : '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums font-bold text-slate-900">
                      {hours(row?.avgPerCleaningMs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
          打刻はシフトと結びついていないため、「清掃のシフトだけに入った日」の勤務時間を、その日の清掃の数で割って求めています。
          清掃以外の仕事もした日は計算から外しています。
          {d && ` 計算に使えたのは、スタッフ×清掃で ${d.samples} 件です。`}
        </p>
      </Card>
    </>
  );
}

// ============================================================
// スタッフ
// ============================================================

function StaffTab({
  data,
  sel,
  onSelectMonth,
}: {
  data: AnalyticsData;
  sel: Selection;
  onSelectMonth: (m: string) => void;
}) {
  const s = sel.summary;
  const totalMs = s.laborByStaff.reduce((sum, r) => sum + r.workMs, 0);
  const rows = [...s.laborByStaff].sort((a, b) => b.workMs - a.workMs);

  return (
    <>
      <Card className="p-5">
        <SectionHead
          title={`負担の割合（${sel.label}）`}
          hint="全員の勤務時間のうち、その人が占める割合。偏りがないかを見る"
        />
        {s.isFuture ? (
          <Empty>先の期間の勤務はまだありません</Empty>
        ) : rows.length === 0 ? (
          <Empty>この期間の勤務記録はありません</Empty>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const share = totalMs > 0 ? r.workMs / totalMs : 0;
              return (
                <li key={r.userId}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold text-slate-700 truncate">
                      {r.name}
                      {r.missingWageDays > 0 && (
                        <span className="ml-1.5 text-[11px] font-bold text-amber-700">
                          ⚠ 時給未設定 {r.missingWageDays}日
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-base font-bold text-slate-900 tabular-nums">{pct(share)}</span>
                  </div>
                  <Meter rate={share} title={`${r.name}：${pct(share)}`} />
                  <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                    {r.days}日・{formatDuration(r.workMs)}・清掃{r.cleanings}回・{formatYen(r.amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <SectionHead title="人件費の推移" hint="月ごと。給与集計と同じ計算。押すとその月を選ぶ" />
        <LaborChart data={data} selected={sel.month} onSelect={onSelectMonth} />
      </Card>
    </>
  );
}

// ============================================================
// 部品
// ============================================================

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div role="tablist" className="inline-flex p-0.5 rounded-xl bg-slate-200/70">
      {options.map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`px-4 py-1.5 rounded-[10px] text-sm font-bold transition-colors ${
            value === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Notice({ tone, children }: { tone: 'amber' | 'red'; children: React.ReactNode }) {
  const cls =
    tone === 'amber' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-600 border-red-200';
  return <div className={`px-3 py-2 rounded-lg border text-xs font-semibold leading-relaxed ${cls}`}>{children}</div>;
}

function StatTile({
  label,
  value,
  delta,
  note,
  onClick,
}: {
  label: string;
  value: string;
  delta?: string | null;
  note?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {delta ? (
        <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">前月比 {delta}</p>
      ) : (
        note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>
      )}
    </>
  );
  return onClick ? (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-2xl shadow-sm border border-slate-200 p-4 hover:border-blue-300 transition-colors"
    >
      {body}
    </button>
  ) : (
    <Card className="p-4">{body}</Card>
  );
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-3">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className={`mt-0.5 tabular-nums font-bold ${strong ? 'text-lg text-slate-900' : 'text-base text-slate-700'}`}>
        {value}
      </p>
    </div>
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

function PropertyLabel({ p }: { p: { name: string; color: string } }) {
  return (
    <span className="flex items-center gap-1.5 font-semibold text-slate-700 min-w-0">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
      <span className="truncate">{p.name}</span>
    </span>
  );
}

/** 横棒の割合。0〜1 */
function Meter({ rate, title }: { rate: number | null; title: string }) {
  const width = rate === null ? 0 : Math.max(rate * 100, rate > 0 ? 1.5 : 0);
  return (
    <div className="mt-1 h-2.5 rounded bg-slate-100 overflow-hidden" title={title}>
      <div className="h-full rounded" style={{ width: `${Math.min(width, 100)}%`, backgroundColor: BAR }} />
    </div>
  );
}

/** 曜日ごとの稼働の縦棒。7本なので値を全部書いても読める */
function WeekdayChart({ weekday }: { weekday: Summary['weekday'] }) {
  const H = 110;
  // 月曜始まりで並べる（週末がまとまって見えるように）
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: H + 18 }}>
        {order.map((wd) => {
          const w = weekday[wd];
          const h = w.rate === null ? 0 : w.rate * H;
          return (
            <div key={wd} className="flex-1 flex flex-col items-center justify-end h-full">
              <span className="text-[11px] font-bold text-slate-700 tabular-nums mb-1">{pct(w.rate)}</span>
              <span
                className="block w-full max-w-[36px] rounded-t"
                style={{ height: w.rate ? Math.max(h, 2) : 0, backgroundColor: BAR }}
                title={`${WEEKDAYS[wd]}曜の夜：${pct(w.rate)}（${w.bookedNights}/${w.availableNights}泊）`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 border-t border-slate-300 pt-1">
        {order.map((wd) => (
          <span
            key={wd}
            className={`flex-1 text-center text-xs font-bold ${
              wd === 0 ? 'text-rose-500' : wd === 6 ? 'text-sky-600' : 'text-slate-500'
            }`}
          >
            {WEEKDAYS[wd]}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * 月 × 棟の稼働率。縦に月、横に棟を並べる。
 * 月を横に並べるとスマホの幅からはみ出すため。棟が多いときだけ表の中で横に送る。
 * 数字を必ず書き、色の濃さは補助にする（色だけで読ませない）。
 */
function OccupancyHeatmap({
  data,
  selected,
  onSelect,
  hasStayData,
}: {
  data: AnalyticsData;
  selected: string | null;
  onSelect: (m: string) => void;
  hasStayData: (m: string) => boolean;
}) {
  return (
    <div className="overflow-x-auto max-w-full">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white z-10 w-16" />
            {data.properties.map((p) => (
              <th key={p.id} className="px-0.5 pb-1 font-semibold text-slate-600 min-w-[3.25rem]">
                <span className="flex items-center justify-center gap-1 max-w-[6rem] mx-auto">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="truncate">{p.name}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.byMonth.map((m, i) => (
            <tr key={m.month}>
              <th
                className={`sticky left-0 bg-white z-10 pr-2 text-left font-semibold tabular-nums whitespace-nowrap ${
                  m.month === selected
                    ? 'text-blue-700'
                    : m.month > data.currentMonth
                      ? 'text-slate-300'
                      : 'text-slate-500'
                }`}
              >
                {(i === 0 || m.month.endsWith('-01')) && (
                  <span className="text-[9px] font-normal mr-1">{m.month.slice(0, 4)}</span>
                )}
                {shortMonth(m.month)}
              </th>
              {data.properties.map((p) => {
                const o = m.perProperty.find((x) => x.propertyId === p.id)?.occupancy;
                const rate = hasStayData(m.month) ? (o?.rate ?? null) : null;
                const strong = rate !== null && rate >= 0.55;
                return (
                  <td key={p.id} className="p-0">
                    <button
                      onClick={() => onSelect(m.month)}
                      className={`w-full h-8 rounded text-[11px] font-bold tabular-nums ${
                        m.month === selected ? 'ring-2 ring-slate-900' : ''
                      } ${rate === null ? 'text-slate-300 bg-slate-50' : strong ? 'text-white' : 'text-slate-700'}`}
                      style={
                        rate === null ? undefined : { backgroundColor: `rgba(37, 99, 235, ${0.08 + rate * 0.82})` }
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
  selected: string | null;
  onSelect: (m: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const rows = data.byMonth.filter((m) => !m.isFuture);
  const max = Math.max(1, ...rows.map((m) => m.laborTotal ?? 0));
  const focus = hover ?? selected ?? data.currentMonth;
  const focusRow = rows.find((m) => m.month === focus);
  const H = 140;

  return (
    <div>
      {/* 棒の上に毎回数字を並べると読みにくいので、指を置いた月（無ければ選んだ月）の値を1か所に出す */}
      <p className="text-xs text-slate-500 mb-2 h-4 tabular-nums">
        {focusRow && (
          <>
            {formatMonthJa(focusRow.month)}：
            <span className="font-bold text-slate-900">{formatYen(focusRow.laborTotal ?? 0)}</span>
          </>
        )}
      </p>
      <div className="relative" style={{ height: H }}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-200" />
        <span className="absolute right-0 -top-4 text-[10px] text-slate-400 tabular-nums">{formatYen(max)}</span>
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
