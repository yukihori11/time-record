import RoleGuard from '@/app/components/guards/RoleGuard';
import AppHeader from '@/app/components/layout/AppHeader';
import AppShell from '@/app/components/layout/AppNav';
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
      <AppShell>
        <AppHeader title="予約カレンダー" subtitle="宿泊状況とシフト" />
        {/* カレンダーは横幅があるほど見やすいので広めに取る */}
        <main className="max-w-5xl mx-auto px-4 py-5">
          <CalendarView
            initialMonth={month}
            initialData={data}
            currentUserId={data.currentUserId}
            isAdmin={data.isAdmin}
          />
        </main>
      </AppShell>
    </RoleGuard>
  );
}
