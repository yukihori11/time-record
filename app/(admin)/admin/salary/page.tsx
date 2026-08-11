import AppHeader from '@/app/components/layout/AppHeader';
import AdminSalaryView from './AdminSalaryView';

export const metadata = { title: '給与集計 | 民泊勤怠管理' };

export default function AdminSalaryPage() {
  return (
    <>
      <AppHeader title="給与集計" subtitle="全スタッフの月次支給額" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <AdminSalaryView />
      </main>
    </>
  );
}
