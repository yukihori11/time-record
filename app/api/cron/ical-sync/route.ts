import { NextResponse } from 'next/server';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { log } from '@/app/lib/api/logger';
import { syncAllFeeds } from '@/app/lib/server/ical-sync';

/**
 * 毎朝の自動同期（Vercel Cron から呼ばれる）。
 *
 * Vercel は環境変数 CRON_SECRET を Authorization ヘッダーに付けて呼ぶ。
 * 一致しない呼び出しは弾く。未設定のときも動かさない（誰でも叩けてしまうため）。
 */
export const GET = withLogging('cron.ical-sync', async (request: Request, _route, ctx) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      log.error('cron.ical-sync.no_secret', {});
      return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'CRON_SECRET が未設定です' } }, { status: 500 });
    }
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '認証に失敗しました' } }, { status: 401 });
    }

    const results = await syncAllFeeds();
    ctx.addFields({
      feeds: results.length,
      failed: results.filter((r) => !r.ok).length,
    });

    return NextResponse.json({ results });
  } catch (error) {
    return errorResponse(error);
  }
});
