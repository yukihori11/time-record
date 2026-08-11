import { NextResponse } from 'next/server';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { monthStr } from '@/app/lib/api/validate';
import { getCalendarData } from '@/app/lib/server/queries';

/**
 * カレンダー画面のデータ。
 *
 * 月を切り替えたときにクライアントから呼ばれる。
 * 初期表示は Server Component が同じ関数を直接使うため、
 * ここを経由しない（HTTPの往復が発生しない）。
 */
export const GET = withLogging('calendar.get', async (request: Request) => {
  try {
    const url = new URL(request.url);
    const month = monthStr(url.searchParams.get('month'), 'month');

    // 認証・権限の判定は getCalendarData 内の requireUser が行う
    const data = await getCalendarData(month);

    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error);
  }
});
