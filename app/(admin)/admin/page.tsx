import AppHeader from '@/app/components/layout/AppHeader';
import AdminDashboard from './AdminDashboard';

export const metadata = { title: '管理 | 民泊勤怠管理' };

export default function AdminPage() {
  const today = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());

  return (
    <>
      <AppHeader title="管理ホーム" subtitle={today} />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <AdminDashboard />
      </main>
    </>
  );
}
