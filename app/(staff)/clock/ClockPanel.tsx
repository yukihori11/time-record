'use client';

import { useState } from 'react';
import type { PayrollSettings, Property } from '@/app/types/domain';
import {
  useClockStatus,
  type SerializedSession,
} from '@/app/hooks/useClockStatus';
import { useElapsed } from '@/app/hooks/useElapsed';
import { availableActions, stateLabel } from '@/app/lib/domain/session-state';
import { formatClock, formatDuration, formatYen } from '@/app/lib/domain/format';
import { toJstTimeString } from '@/app/lib/domain/datetime';
import { amountFromMinutes } from '@/app/lib/domain/payroll';
import { roundMinutes } from '@/app/lib/domain/rounding';
import Button from '@/app/components/ui/Button';
import { Card, ErrorBanner } from '@/app/components/ui/Feedback';
import { Select } from '@/app/components/ui/Field';

const STATE_STYLES = {
  idle: 'bg-slate-100 text-slate-600',
  working: 'bg-emerald-100 text-emerald-700',
  on_break: 'bg-amber-100 text-amber-700',
} as const;

interface Props {
  initialSession: SerializedSession | null;
  initialProperties: Property[];
  settings: PayrollSettings;
  currentWage: number | null;
  serverNow: string;
}

export default function ClockPanel({
  initialSession,
  initialProperties,
  settings,
  currentWage,
  serverNow,
}: Props) {
  // 初期値はサーバーで取得済み。マウント時の再取得は行わない。
  const { state, session, properties, punching, error, punch, clockOffset } =
    useClockStatus({ initialSession, initialProperties, serverNow });

  const [propertyId, setPropertyId] = useState<string>('');
  const [confirmingOut, setConfirmingOut] = useState(false);

  // 端末の時計がズレていても正しい経過時間を出すため offset を渡す
  const { workMs, breakMs } = useElapsed(session, clockOffset);
  const actions = availableActions(state);

  // 今の時点で確定している金額の目安
  const previewAmount = (() => {
    if (!settings || !currentWage || workMs <= 0) return null;
    const rounded = roundMinutes(
      workMs / 60_000,
      settings.roundingMinutes,
      settings.roundingMode
    );
    const billed = Math.max(settings.minGuaranteedMinutes, rounded);
    return amountFromMinutes(billed, currentWage);
  })();

  const property = properties.find((p) => p.id === session?.propertyId);

  const handleClockOut = async () => {
    if (!confirmingOut) {
      setConfirmingOut(true);
      return;
    }
    setConfirmingOut(false);
    await punch('clock_out');
  };

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />

      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <span
            className={`px-3 py-1.5 rounded-full text-sm font-bold ${STATE_STYLES[state.kind]}`}
          >
            {stateLabel(state)}
          </span>
          {property && (
            <span
              className="px-3 py-1.5 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: property.color }}
            >
              {property.name}
            </span>
          )}
        </div>

        <div className="text-center py-4">
          <div className="text-5xl sm:text-6xl font-mono font-bold text-slate-900 tabular-nums tracking-tight">
            {formatClock(workMs)}
          </div>
          <p className="text-sm text-slate-500 mt-2">実労働時間</p>
        </div>

        {session && (
          <div className="grid grid-cols-2 gap-3 mt-6 pt-6 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-500">出勤</p>
              <p className="text-lg font-bold text-slate-900">
                {toJstTimeString(session.clockIn)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">休憩</p>
              <p className="text-lg font-bold text-amber-600">
                {formatDuration(breakMs)}
              </p>
            </div>
          </div>
        )}

        {previewAmount !== null && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-500">現時点の金額</span>
              <span className="text-2xl font-bold text-blue-600">
                {formatYen(previewAmount)}
              </span>
            </div>
            {settings && workMs > 0 &&
              settings.minGuaranteedMinutes >
                roundMinutes(
                  workMs / 60_000,
                  settings.roundingMinutes,
                  settings.roundingMode
                ) && (
                <p className="text-xs text-emerald-600 mt-1.5">
                  最低保証（{settings.minGuaranteedMinutes / 60}時間）適用中
                </p>
              )}
          </div>
        )}
      </Card>

      {/* 出勤前は棟を選ぶ */}
      {state.kind === 'idle' && properties.length > 0 && (
        <Card className="p-4">
          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-2">
              担当する棟
            </span>
            <Select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              <option value="">選択しない</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
        </Card>
      )}

      {/* 打刻ボタン。状態に応じて出るものが変わる */}
      <div className="space-y-3">
        {actions.clockIn && (
          <Button
            size="xl"
            variant="success"
            fullWidth
            loading={punching}
            onClick={() => punch('clock_in', propertyId || null)}
          >
            出勤
          </Button>
        )}

        {actions.breakStart && (
          <Button
            size="xl"
            variant="warning"
            fullWidth
            loading={punching}
            onClick={() => punch('break_start')}
          >
            休憩に入る
          </Button>
        )}

        {actions.breakEnd && (
          <Button
            size="xl"
            variant="primary"
            fullWidth
            loading={punching}
            onClick={() => punch('break_end')}
          >
            休憩から戻る
          </Button>
        )}

        {actions.clockOut && (
          <>
            <Button
              size="xl"
              variant={confirmingOut ? 'danger' : 'secondary'}
              fullWidth
              loading={punching}
              onClick={handleClockOut}
            >
              {confirmingOut ? '本当に退勤しますか？' : '退勤'}
            </Button>
            {confirmingOut && (
              <Button
                size="md"
                variant="ghost"
                fullWidth
                onClick={() => setConfirmingOut(false)}
              >
                キャンセル
              </Button>
            )}
          </>
        )}
      </div>

      {state.kind === 'on_break' && (
        <p className="text-center text-sm text-amber-600">
          休憩中は労働時間に加算されません
        </p>
      )}

      {/* 今日の休憩履歴 */}
      {session && session.breaks.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-3">休憩の記録</h2>
          <ul className="space-y-2">
            {session.breaks.map((b) => (
              <li
                key={b.id}
                className="flex justify-between text-sm bg-amber-50 px-3 py-2 rounded-lg"
              >
                <span className="text-slate-700">
                  {toJstTimeString(b.breakStart)} 〜{' '}
                  {b.breakEnd ? toJstTimeString(b.breakEnd) : '休憩中'}
                </span>
                {b.breakEnd && (
                  <span className="text-slate-500">
                    {formatDuration(
                      b.breakEnd.getTime() - b.breakStart.getTime()
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
