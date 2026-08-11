import AppHeader from '@/app/components/layout/AppHeader';
import { getMyShifts } from '@/app/lib/server/queries';
import { todayJst } from '@/app/lib/domain/datetime';
import ShiftsView from './ShiftsView';

export const metadata = { title: 'シフト | 民泊勤怠管理' };

export const dynamic = 'force-dynamic';

export default async function ShiftsPage() {
  const month = todayJst().slice(0, 7);
  const data = await getMyShifts(month);

  return (
    <>
      <AppHeader title="シフト" subtitle="承諾・辞退の回答" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <ShiftsView
          initialMonth={month}
          initialShifts={data.shifts}
          initialProperties={data.properties}
        />
      </main>
    </>
  );
}
