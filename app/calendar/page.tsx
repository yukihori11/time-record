import RoleGuard from '@/app/components/guards/RoleGuard';
import AppHeader from '@/app/components/layout/AppHeader';
import BottomNav from '@/app/components/layout/BottomNav';
import CalendarView from './CalendarView';

export const metadata = { title: '予約カレンダー | 民泊勤怠管理' };

export default function CalendarPage() {
  return (
    <RoleGuard>
      <div className="min-h-dvh bg-slate-50 pb-20">
        <AppHeader title="予約カレンダー" subtitle="宿泊状況とシフト" />
        <main className="max-w-3xl mx-auto px-4 py-5">
          <CalendarView />
        </main>
      </div>
      <BottomNav />
    </RoleGuard>
  );
}
