import RoleGuard from '@/app/components/guards/RoleGuard';
import AppHeader from '@/app/components/layout/AppHeader';
import BottomNav from '@/app/components/layout/BottomNav';
import { getCalendarData } from '@/app/lib/server/queries';
import { todayJst } from '@/app/lib/domain/datetime';
import CalendarView from './CalendarView';

export const metadata = { title: '予約カレンダー | 民泊勤怠管理' };

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const month = todayJst().slice(0, 7);
  const data = await getCalendarData(month);

  return (
    <RoleGuard>
      <div className="min-h-dvh bg-slate-50 pb-20">
        <AppHeader title="予約カレンダー" subtitle="宿泊状況とシフト" />
        <main className="max-w-3xl mx-auto px-4 py-5">
          <CalendarView
            initialMonth={month}
            initialData={data}
            currentUserId={data.currentUserId}
            isAdmin={data.isAdmin}
          />
        </main>
      </div>
      <BottomNav />
    </RoleGuard>
  );
}
