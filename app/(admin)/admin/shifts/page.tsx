import AppHeader from '@/app/components/layout/AppHeader';
import AdminShiftsView from './AdminShiftsView';

export const metadata = { title: 'シフト割当 | 民泊勤怠管理' };

export default function AdminShiftsPage() {
  return (
    <>
      <AppHeader title="シフト割当" subtitle="スタッフへの割り当てと回答状況" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <AdminShiftsView />
      </main>
    </>
  );
}
