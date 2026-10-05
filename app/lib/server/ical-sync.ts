import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { errorFields, log } from '@/app/lib/api/logger';
import { createAdminSupabase } from '@/app/lib/supabase/server';
import {
  isAllowedIcalUrl,
  looksLikeIcal,
  parseAirbnbIcal,
} from '@/app/lib/domain/ical';
import { planCancellations } from '@/app/lib/domain/stays';
import { todayJst } from '@/app/lib/domain/datetime';

/**
 * Airbnb の iCal を取り込む。
 *
 * 毎朝の自動実行にはログインした人がいないため、service_role で書き込む。
 * 書き込むのは airbnb_stays の日付・種別・予約コード・状態と、
 * property_ical_feeds の同期時刻・エラーだけ。人数・メモ・ゲスト名には触らない。
 *
 * iCal の URL には読み取り用の秘密の値が含まれるので、ログに出さない。
 */

const FETCH_TIMEOUT_MS = 10_000;

/** カレンダーを開いたときの同期は、前回からこの時間が経っていなければ省く */
export const OPEN_SYNC_INTERVAL_MS = 10 * 60 * 1000;

export interface FeedSyncResult {
  propertyId: string;
  ok: boolean;
  upserted: number;
  cancelled: number;
  /** iCal が空だったためキャンセルを見送った */
  cancelSkipped: boolean;
  error?: string;
}

interface FeedRow {
  property_id: string;
  ical_url: string;
  last_synced_at: string | null;
}

async function fetchIcal(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      // 別ドメインへ転送させて内部のアドレスを読ませる手口を防ぐ
      redirect: 'error',
    });
    if (!res.ok) throw new Error(`Airbnb から取得できませんでした（HTTP ${res.status}）`);
    const text = await res.text();
    if (!looksLikeIcal(text)) throw new Error('iCal の形式ではありませんでした');
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Airbnb の応答がありませんでした（タイムアウト）');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function syncFeed(
  admin: SupabaseClient,
  feed: FeedRow
): Promise<FeedSyncResult> {
  const base = { propertyId: feed.property_id, upserted: 0, cancelled: 0, cancelSkipped: false };

  try {
    if (!isAllowedIcalUrl(feed.ical_url)) {
      throw new Error('Airbnb の iCal の URL ではありません');
    }

    const stays = parseAirbnbIcal(await fetchIcal(feed.ical_url));
    const now = new Date().toISOString();

    if (stays.length > 0) {
      // 人数・メモは含めないので、既存行では上書きされない
      const { error } = await admin.from('airbnb_stays').upsert(
        stays.map((s) => ({
          property_id: feed.property_id,
          ical_uid: s.uid,
          kind: s.kind,
          check_in: s.checkIn,
          check_out: s.checkOut,
          reservation_code: s.reservationCode,
          status: 'active',
          last_seen_at: now,
        })),
        { onConflict: 'property_id,ical_uid' }
      );
      if (error) throw error;
    }

    const today = todayJst();
    const { data: existing, error: existingError } = await admin
      .from('airbnb_stays')
      .select('id, ical_uid, status, check_out')
      .eq('property_id', feed.property_id)
      .eq('status', 'active')
      .gte('check_out', today);
    if (existingError) throw existingError;

    const plan = planCancellations(
      (existing ?? []).map((r) => ({
        id: r.id as string,
        icalUid: r.ical_uid as string,
        status: r.status as 'active' | 'cancelled',
        checkOut: r.check_out as string,
      })),
      new Set(stays.map((s) => s.uid)),
      today
    );

    if (plan.cancelIds.length > 0) {
      const { error } = await admin
        .from('airbnb_stays')
        .update({ status: 'cancelled' })
        .in('id', plan.cancelIds);
      if (error) throw error;
    }

    await admin
      .from('property_ical_feeds')
      .update({ last_synced_at: now, last_error: null })
      .eq('property_id', feed.property_id);

    log.info('ical.sync.ok', {
      propertyId: feed.property_id,
      events: stays.length,
      cancelled: plan.cancelIds.length,
      cancelSkipped: plan.skipped,
    });

    return {
      ...base,
      ok: true,
      upserted: stays.length,
      cancelled: plan.cancelIds.length,
      cancelSkipped: plan.skipped,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '取り込みに失敗しました';
    log.error('ical.sync.failed', { propertyId: feed.property_id, ...errorFields(err) });

    // 失敗しても同期時刻は進める。開くたびに失敗し続けるのを避けるため
    await admin
      .from('property_ical_feeds')
      .update({ last_synced_at: new Date().toISOString(), last_error: message.slice(0, 300) })
      .eq('property_id', feed.property_id);

    return { ...base, ok: false, error: message };
  }
}

/**
 * 登録されている全ての棟を同期する。
 *
 * onlyIfStale を指定すると、前回の同期から一定時間が経った棟だけを対象にする。
 * カレンダーを開くたびに Airbnb へ取りに行かないため。
 */
export async function syncAllFeeds(
  opts: { onlyIfStale?: boolean } = {}
): Promise<FeedSyncResult[]> {
  const admin = createAdminSupabase();

  const { data, error } = await admin
    .from('property_ical_feeds')
    .select('property_id, ical_url, last_synced_at');
  if (error) throw error;

  const now = Date.now();
  const feeds = ((data ?? []) as FeedRow[]).filter(
    (f) =>
      !opts.onlyIfStale ||
      !f.last_synced_at ||
      now - new Date(f.last_synced_at).getTime() >= OPEN_SYNC_INTERVAL_MS
  );

  return Promise.all(feeds.map((f) => syncFeed(admin, f)));
}
