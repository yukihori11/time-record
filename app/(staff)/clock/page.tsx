import AppHeader from '@/app/components/layout/AppHeader';
import { getClockData, serializeSession } from '@/app/lib/server/queries';
import ClockPanel from './ClockPanel';

export const metadata = { title: '打刻 | 民泊勤怠管理' };

// 打刻状態は常に最新である必要があるためキャッシュしない
export const dynamic = 'force-dynamic';

export default async function ClockPage() {
  const today = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());

  // サーバー側で取得してHTMLに埋め込む。
  // 画面が届いた時点でデータが入っているため、
  // 表示後にローディングが走らない。
  const data = await getClockData();

  return (
    <>
      <AppHeader title="打刻" subtitle={today} />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <ClockPanel
          initialSession={serializeSession(data.session)}
          initialProperties={data.properties}
          settings={data.settings}
          currentWage={data.currentWage}
          serverNow={data.serverNow}
        />
      </main>
    </>
  );
}
