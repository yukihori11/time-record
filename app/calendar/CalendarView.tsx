'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DayActual,
  MonthlyActualTotal,
  Property,
  ReservationType,
  Schedule,
  Shift,
  Stay,
  UserProfile,
} from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { todayJst } from '@/app/lib/domain/datetime';
import { formatDuration, formatYen } from '@/app/lib/domain/format';
import { buildDayDetail, schedulesByDate } from '@/app/lib/domain/occupancy';
import type { CleaningStatus } from '@/app/lib/domain/stays';
import { cleaningStatus } from '@/app/lib/domain/stays';
import MonthNav from '@/app/components/MonthNav';
import { ErrorBanner, Spinner } from '@/app/components/ui/Feedback';
import Button from '@/app/components/ui/Button';
import CalendarGrid, { CLEANING_MARK } from './CalendarGrid';
import PropertyTimeline from './PropertyTimeline';
import DayDetail from './DayDetail';
import ScheduleForm from './ScheduleForm';

interface CalendarData {
  schedules: Schedule[];
  properties: Property[];
  shifts: Shift[];
  types: ReservationType[];
  /** Airbnb から取り込んだ宿泊 */
  stays: Stay[];
  users: UserProfile[];
  /** 日付ごとの実績（打刻の結果） */
  actuals: Record<string, DayActual[]>;
  monthlyTotal: MonthlyActualTotal;
}

interface Props {
  initialMonth: string;
  initialData: CalendarData;
  currentUserId: string;
  isAdmin: boolean;
}

export default function CalendarView({
  initialMonth,
  initialData,
  currentUserId,
  isAdmin,
}: Props) {
  const [month, setMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    todayJst()
  );
  const [data, setData] = useState<CalendarData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  // 清掃未手配から開いたとき、棟・種別・日付を入れておく
  const [prefill, setPrefill] = useState<{
    propertyId: string;
    typeId?: string;
    date: string;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  // 基本は月のカレンダー。管理者は棟ごとの表示にも切り替えられる。
  // 選んだ表示はこの端末に覚えておく（保存できない環境でも動くようにする）
  const [view, setViewState] = useState<'timeline' | 'month'>('month');
  useEffect(() => {
    try {
      if (localStorage.getItem('calendar.view') === 'timeline') setViewState('timeline');
    } catch {
      // プライベートブラウズなどで読めなくても月表示で使える
    }
  }, []);
  const setView = (v: 'timeline' | 'month') => {
    setViewState(v);
    try {
      localStorage.setItem('calendar.view', v);
    } catch {
      // 保存できなくても切り替えは効く
    }
  };
  const showTimeline = isAdmin && view === 'timeline';

  /**
   * silent のときはスピナーを出さず、取れたら差し替えるだけにする。
   * 裏で Airbnb の変化を反映するときに、カレンダーが消えて
   * 読み込み直したように見えるのを避けるため。
   */
  const load = useCallback(
    async (targetMonth: string, opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      try {
        const res = await api.get<CalendarData>(
          `/api/calendar?month=${targetMonth}`
        );
        // 取得中に月が切り替わっていたら、古い月の結果で上書きしない
        if (opts.silent && targetMonth !== monthRef.current) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (!opts.silent) setError(errorMessage(err));
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    []
  );

  // 月を切り替えたら取りに行く。
  //
  // 初期表示の月だけは、すでにサーバーで取得した分があるので
  // 一度目は通信を省く。ただし戻ってきたときは取り直す。
  //
  // 以前はここで単に return していたため、他の月へ移ったあと
  // 戻ると data が移動先のままになり、予定が消えて見えた。
  // かといって initialData で復元すると、承諾済みのシフトが
  // 未回答へ巻き戻ってしまう。取り直すのが正しい。
  const visited = useRef(false);

  const monthRef = useRef(month);
  monthRef.current = month;

  // 開いたときに Airbnb と同期する。前回から時間が経っていなければ
  // サーバー側で省かれる。
  //
  // 以前は同期できた棟の数（synced）で判断していたため、内容が同じでも
  // 10分ごとに取り直しが走り、スピナーで画面が読み込み直しに見えた。
  // 実際に変わった件数（changed）があるときだけ、裏で静かに差し替える。
  // 失敗してもカレンダーは使えるので、画面にはエラーを出さない。
  useEffect(() => {
    void (async () => {
      try {
        const res = await api.post<{ synced: number; changed?: number }>(
          '/api/ical/sync',
          {}
        );
        if ((res.changed ?? 0) > 0) {
          void load(monthRef.current, { silent: true });
        }
      } catch {
        // 管理者は「Airbnb と同期」ボタンで結果を確かめられる
      }
    })();
  }, [load]);

  /** 管理者が今すぐ同期する */
  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await api.post<{
        synced: number;
        results?: { ok: boolean; error?: string }[];
      }>('/api/ical/sync', { force: true });
      const failed = (res.results ?? []).filter((r) => !r.ok);
      if ((res.results ?? []).length === 0) {
        setSyncMessage('Airbnb の URL が登録されていません（設定 → Airbnb 連携）');
      } else if (failed.length > 0) {
        setSyncMessage(`同期に失敗した棟があります：${failed[0].error ?? ''}`);
      } else {
        setSyncMessage('Airbnb と同期しました');
      }
      void load(month);
    } catch (err) {
      setSyncMessage(errorMessage(err));
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (month === initialMonth && !visited.current) {
      visited.current = true;
      return;
    }
    visited.current = true;
    void load(month);
  }, [month, initialMonth, load]);

  // 予定は1日で完結するので、日付ごとにまとめるだけでよい
  const scheduleMap = useMemo(
    () => schedulesByDate(data.schedules, data.properties, data.types),
    [data.schedules, data.properties, data.types]
  );

  // 宿泊ごとのチェックイン当日の清掃の状態
  const cleaning = useMemo(() => {
    const map = new Map<string, CleaningStatus>();
    for (const st of data.stays ?? []) {
      if (st.kind !== 'reserved') continue;
      map.set(st.id, cleaningStatus(st, data.schedules, data.types, data.shifts));
    }
    return map;
  }, [data.stays, data.schedules, data.types, data.shifts]);

  // 今日以降で清掃が未手配のチェックイン
  const missingCleaningCount = (data.stays ?? []).filter(
    (st) =>
      st.checkIn >= todayJst() &&
      st.checkIn.startsWith(month) &&
      cleaning.get(st.id) === 'missing'
  ).length;

  const cleaningTypeId = data.types.find((t) => t.isCleaning)?.id;

  const openCleaningForm = (propertyId: string, date: string) => {
    setEditing(null);
    setPrefill({ propertyId, typeId: cleaningTypeId, date });
    setFormOpen(true);
  };

  const detail = useMemo(
    () =>
      selectedDate
        ? buildDayDetail(
            selectedDate,
            data.schedules,
            data.properties,
            data.types,
            data.shifts
          )
        : null,
    [selectedDate, data]
  );

  const handleMonthChange = (m: string) => {
    setMonth(m);
    setSelectedDate(null);
  };

  // 未回答・辞退の件数（管理者向け）
  const pendingCount = data.shifts.filter(
    (s) => s.status === 'assigned'
  ).length;
  const declinedCount = data.shifts.filter(
    (s) => s.status === 'declined'
  ).length;

  return (
    <div className="space-y-4 relative">
      <MonthNav month={month} onChange={handleMonthChange} />

      <ErrorBanner message={error} />

      {isAdmin && (
        <div className="flex items-center gap-2 flex-wrap">
          <div
            role="tablist"
            aria-label="表示の切り替え"
            className="inline-flex p-0.5 rounded-xl bg-slate-200/70"
          >
            {(
              [
                ['month', '📅 カレンダー'],
                ['timeline', '🏠 棟ごと'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={`px-3.5 py-1.5 rounded-[10px] text-xs font-bold transition-colors ${
                  view === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            loading={syncing}
            onClick={syncNow}
            className="ml-auto"
          >
            ⟳ Airbnb と同期
          </Button>
          {syncMessage && (
            <span className="w-full text-xs text-slate-500 text-right">{syncMessage}</span>
          )}
        </div>
      )}

      {isAdmin && missingCleaningCount > 0 && (
        <div className="px-3 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-bold">
          {CLEANING_MARK.missing.icon} 清掃が未手配のチェックインが {missingCleaningCount}件あります
        </div>
      )}

      {isAdmin && (pendingCount > 0 || declinedCount > 0) && (
        <div className="flex gap-2 text-xs font-semibold">
          {pendingCount > 0 && (
            <span className="px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              未回答 {pendingCount}件
            </span>
          )}
          {declinedCount > 0 && (
            <span className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200">
              辞退 {declinedCount}件
            </span>
          )}
        </div>
      )}

      {/* 今月の実績。管理者は全員分、スタッフは自分の分 */}
      {data.monthlyTotal.workMs > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAdmin ? '今月の実績（全員）' : '今月の実績'}
            </span>
            <span className="text-xl font-bold text-blue-600 tabular-nums">
              {formatYen(data.monthlyTotal.amount)}
            </span>
          </div>
          <div className="flex gap-4 mt-1 text-xs text-slate-500">
            <span>{data.monthlyTotal.days}日</span>
            <span>{formatDuration(data.monthlyTotal.workMs)}</span>
          </div>
        </div>
      )}

      {/* 棟の色。帯は棟の色で描くので、まずこれを見れば読める */}
      {data.properties.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* タイムラインでは棟名が行に出るので、色の一覧は月表示のときだけ */}
          {!showTimeline && data.properties.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
            </span>
          ))}
          <details className="ml-auto group">
            <summary className="list-none cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700 select-none">
              表示の見方 <span className="inline-block transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-2 p-3 rounded-xl bg-white border border-slate-200 shadow-sm grid gap-1.5 text-[11px] text-slate-600 w-[min(18rem,calc(100vw-2rem))] absolute right-0 z-50">
              <LegendRow sample={<span className="w-8 h-2.5 rounded-full bg-slate-500" />}>
                宿泊（チェックイン → チェックアウト）
              </LegendRow>
              <LegendRow sample={<span className="w-8 h-2.5 rounded" style={{ backgroundImage: 'repeating-linear-gradient(135deg, #e2e8f0 0 4px, #f1f5f9 4px 8px)' }} />}>
                ブロック（Airbnb で売り止め）
              </LegendRow>
              <LegendRow sample={<span className="flex gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /><span className="w-2 h-2 rounded-full bg-amber-400" /><span className="w-2 h-2 rounded-full bg-emerald-500" /></span>}>
                日付の横の点＝清掃の日（チェックインあり）。赤＝未手配・黄＝担当未確定・緑＝OK
              </LegendRow>
              <LegendRow sample={<span>{CLEANING_MARK.missing.icon}</span>}>
                {CLEANING_MARK.missing.label}（帯の先頭）
              </LegendRow>
              <LegendRow sample={<span>{CLEANING_MARK.unassigned.icon}</span>}>
                {CLEANING_MARK.unassigned.label}（帯の先頭）
              </LegendRow>
              <LegendRow sample={<span>{CLEANING_MARK.ready.icon}</span>}>
                {CLEANING_MARK.ready.label}・担当が承諾済み（帯の先頭。過ぎた日は出さない）
              </LegendRow>
              <LegendRow sample={<span className="px-1 rounded bg-amber-500 text-white font-bold text-[9px]">IN×2</span>}>
                2棟以上が同じ日にチェックイン
              </LegendRow>
              <LegendRow sample={<span className="w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold inline-flex items-center justify-center">田</span>}>
                スタッフ（承諾）
              </LegendRow>
              <LegendRow sample={<span className="w-[18px] h-[18px] rounded-full bg-white text-amber-600 ring-1 ring-inset ring-amber-400 text-[10px] font-bold inline-flex items-center justify-center">田</span>}>
                スタッフ（未回答）
              </LegendRow>
              {data.types.map((t) => (
                <LegendRow
                  key={t.id}
                  sample={
                    <span
                      className="px-1 rounded text-[10px] font-semibold"
                      style={{ backgroundColor: `${t.color}22`, color: t.color }}
                    >
                      {t.icon}
                    </span>
                  }
                >
                  {t.name}
                </LegendRow>
              ))}
            </div>
          </details>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <>
          {showTimeline ? (
            <PropertyTimeline
              month={month}
              properties={data.properties}
              stays={data.stays ?? []}
              cleaning={cleaning}
              scheduleMap={scheduleMap}
              shifts={data.shifts}
              onSelect={setSelectedDate}
              selectedDate={selectedDate}
            />
          ) : (
          <CalendarGrid
            month={month}
            scheduleMap={scheduleMap}
            shifts={data.shifts}
            users={data.users}
            actuals={data.actuals}
            properties={data.properties}
            stays={data.stays ?? []}
            cleaning={cleaning}
            onSelect={setSelectedDate}
            selectedDate={selectedDate}
          />
          )}

          {isAdmin && (
            <Button
              fullWidth
              size="md"
              onClick={() => {
                setEditing(null);
                setPrefill(null);
                setFormOpen(true);
              }}
            >
              ＋ 予定を追加
            </Button>
          )}

          {detail && (
            <DayDetail
              detail={detail}
              properties={data.properties}
              users={data.users}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              actuals={data.actuals[detail.date] ?? []}
              onChanged={() => load(month)}
              onEditSchedule={(sc) => {
                setEditing(sc);
                setPrefill(null);
                setFormOpen(true);
              }}
              stays={data.stays ?? []}
              cleaning={cleaning}
              onCreateCleaning={openCleaningForm}
            />
          )}
        </>
      )}

      {formOpen && isAdmin && (
        <ScheduleForm
          // key が無いと、追加フォームを開いたあと編集を開いても
          // React が同じフォームを使い回す。初期値は useState で
          // 一度しか評価されないため、メモや人数が前のまま残る。
          // 対象が変わったら作り直させる。
          key={editing?.id ?? (prefill ? `new-${prefill.propertyId}-${prefill.date}` : 'new')}
          properties={data.properties}
          types={data.types}
          users={data.users}
          schedule={editing}
          defaultDate={prefill?.date ?? selectedDate ?? todayJst()}
          defaultPropertyId={prefill?.propertyId}
          defaultTypeId={prefill?.typeId}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
            setPrefill(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            setPrefill(null);
            void load(month);
          }}
        />
      )}
    </div>
  );
}

function LegendRow({
  sample,
  children,
}: {
  sample: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 flex justify-center shrink-0">{sample}</span>
      <span>{children}</span>
    </div>
  );
}
