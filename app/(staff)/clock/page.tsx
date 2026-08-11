import AppHeader from '@/app/components/layout/AppHeader';
import ClockPanel from './ClockPanel';

export const metadata = { title: '打刻 | 民泊勤怠管理' };

export default function ClockPage() {
  const today = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());

  return (
    <>
      <AppHeader title="打刻" subtitle={today} />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <ClockPanel />
      </main>
    </>
  );
}
