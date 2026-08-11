'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClockState, Property, WorkSession } from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { deriveClockState } from '@/app/lib/domain/session-state';

export interface SerializedSession
  extends Omit<WorkSession, 'clockIn' | 'clockOut' | 'breaks' | 'editedAt'> {
  clockIn: string;
  clockOut: string | null;
  editedAt: string | null;
  breaks: {
    id: string;
    sessionId: string;
    breakStart: string;
    breakEnd: string | null;
  }[];
}

interface StatusResponse {
  session: SerializedSession | null;
  properties: Property[];
  serverNow: string;
}

function parseSession(raw: SerializedSession | null): WorkSession | null {
  if (!raw) return null;
  return {
    ...raw,
    clockIn: new Date(raw.clockIn),
    clockOut: raw.clockOut ? new Date(raw.clockOut) : null,
    editedAt: raw.editedAt ? new Date(raw.editedAt) : null,
    breaks: raw.breaks.map((b) => ({
      id: b.id,
      sessionId: b.sessionId,
      breakStart: new Date(b.breakStart),
      breakEnd: b.breakEnd ? new Date(b.breakEnd) : null,
    })),
  };
}

export type PunchAction =
  | 'clock_in'
  | 'clock_out'
  | 'break_start'
  | 'break_end';

interface Options {
  initialSession: SerializedSession | null;
  initialProperties: Property[];
  serverNow: string;
}

/**
 * 打刻状態を維持する。
 *
 * 初期値はサーバー側で取得済みのものを受け取るため、
 * マウント直後の取得は行わない（画面が出た時点で表示が完成している）。
 *
 * その後の再取得のきっかけは3つ:
 *   - visibilitychange（iOS Safari はタブを破棄するのでこれが最重要）
 *   - focus（別ウィンドウから戻ったとき）
 *   - online（通信復帰）
 *
 * 加えて勤務中のみ60秒ごとに追従する。未出勤時は無駄なので止める。
 */
export function useClockStatus({
  initialSession,
  initialProperties,
  serverNow,
}: Options) {
  const [session, setSession] = useState<WorkSession | null>(() =>
    parseSession(initialSession)
  );
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [punching, setPunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // サーバーとクライアントの時計のズレ。表示の補正に使う。
  const [clockOffset, setClockOffset] = useState(
    () => new Date(serverNow).getTime() - Date.now()
  );

  const applyResponse = useCallback(
    (data: { session: SerializedSession | null; serverNow: string }) => {
      setSession(parseSession(data.session));
      setClockOffset(new Date(data.serverNow).getTime() - Date.now());
    },
    []
  );

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<StatusResponse>('/api/clock/status');
      applyResponse(data);
      setProperties(data.properties);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [applyResponse]);

  const isWorking = session !== null;

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);

    // 勤務中だけ定期的に追従する（別端末での打刻を拾うため）
    const interval = isWorking ? setInterval(refresh, 60_000) : null;

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      if (interval) clearInterval(interval);
    };
  }, [refresh, isWorking]);

  /**
   * 打刻を実行する。
   *
   * 楽観的更新はしない。競合したときに画面とDBがズレるのを避け、
   * 常にサーバーが返した状態を正とする。
   * エラー時も必ず再取得して実態に合わせる。
   */
  const punch = useCallback(
    async (action: PunchAction, propertyId?: string | null) => {
      setPunching(true);
      setError(null);

      try {
        const data = await api.post<{
          session: SerializedSession | null;
          serverNow: string;
        }>('/api/clock/punch', { action, propertyId: propertyId ?? null });
        applyResponse(data);
        return true;
      } catch (err) {
        setError(errorMessage(err));
        // 状態が食い違っている可能性があるので実態を取り直す
        await refresh();
        return false;
      } finally {
        setPunching(false);
      }
    },
    [applyResponse, refresh]
  );

  const state: ClockState = deriveClockState(session);

  return {
    state,
    session,
    properties,
    punching,
    error,
    clearError: () => setError(null),
    punch,
    refresh,
    clockOffset,
  };
}
