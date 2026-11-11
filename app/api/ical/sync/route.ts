import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { readBody } from '@/app/lib/api/validate';
import { syncAllFeeds } from '@/app/lib/server/ical-sync';

/**
 * Airbnb と同期する。
 *
 * カレンダーを開いたときに呼ばれる。前回から一定時間が経った棟だけを
 * 取りに行くので、誰が何度開いても Airbnb への通信は増えない。
 * 管理者は force で間隔を無視して今すぐ同期できる。
 *
 * スタッフには結果の件数だけを返す。エラーの中身は管理者にだけ見せる。
 */
export const POST = withLogging('ical.sync', async (request: Request, _route, ctx) => {
  try {
    const { profile } = await requireUser();
    const isAdmin = profile.role === 'admin';

    const body = await readBody(request).catch(() => ({}) as Record<string, unknown>);
    const force = isAdmin && body.force === true;

    const results = await syncAllFeeds({ onlyIfStale: !force });
    ctx.addFields({ force, feeds: results.length });

    const synced = results.filter((r) => r.ok).length;
    // 画面はこれが 1 以上のときだけ取り直す
    const changed = results.reduce((sum, r) => sum + r.changed, 0);

    if (!isAdmin) return NextResponse.json({ synced, changed });
    return NextResponse.json({ synced, changed, results });
  } catch (error) {
    return errorResponse(error);
  }
});
