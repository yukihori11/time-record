import { NextResponse } from 'next/server';
import type { IcalFeedStatus } from '@/app/types/domain';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { optionalStr, readBody, uuid } from '@/app/lib/api/validate';
import { isAllowedIcalUrl } from '@/app/lib/domain/ical';

/* eslint-disable @typescript-eslint/no-explicit-any */
function toFeed(row: any): IcalFeedStatus {
  return {
    propertyId: row.property_id,
    icalUrl: row.ical_url,
    lastSyncedAt: row.last_synced_at ?? null,
    lastError: row.last_error ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// 棟ごとの Airbnb 連携の状態。URL を含むので管理者だけ
export const GET = withLogging('admin.ical-feeds.get', async () => {
  try {
    const { supabase } = await requireAdmin();

    const { data, error } = await supabase
      .from('property_ical_feeds')
      .select('property_id, ical_url, last_synced_at, last_error');
    if (error) throw error;

    return NextResponse.json({ feeds: (data ?? []).map(toFeed) });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * 棟の iCal の URL を登録・変更する。空にすると連携をやめる。
 * 連携をやめても取り込み済みの宿泊は消さない（手で入れた人数を残すため）。
 */
export const PUT = withLogging('admin.ical-feeds.put', async (request: Request) => {
  try {
    const { supabase } = await requireAdmin();
    const body = await readBody(request);

    const propertyId = uuid(body.propertyId, '棟');
    const icalUrl = optionalStr(body.icalUrl, 'iCal の URL', 1000);

    if (!icalUrl) {
      const { error } = await supabase
        .from('property_ical_feeds')
        .delete()
        .eq('property_id', propertyId);
      if (error) throw error;
      return NextResponse.json({ feed: null });
    }

    if (!isAllowedIcalUrl(icalUrl)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Airbnb の「カレンダーをエクスポート」で表示される https の URL を貼ってください'
      );
    }

    // URL を変えたら前回の同期時刻を消し、次に開いたときすぐ取り込ませる
    const { data, error } = await supabase
      .from('property_ical_feeds')
      .upsert(
        { property_id: propertyId, ical_url: icalUrl, last_synced_at: null, last_error: null },
        { onConflict: 'property_id' }
      )
      .select('property_id, ical_url, last_synced_at, last_error')
      .single();
    if (error) throw error;

    return NextResponse.json({ feed: toFeed(data) });
  } catch (error) {
    return errorResponse(error);
  }
});
