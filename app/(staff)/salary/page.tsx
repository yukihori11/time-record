import AppHeader from '@/app/components/layout/AppHeader';
import SalaryView from './SalaryView';

export const metadata = { title: '給与 | 民泊勤怠管理' };

export default function SalaryPage() {
  return (
    <>
      <AppHeader title="給与" subtitle="日別の金額と月合計" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <SalaryView />
      </main>
    </>
  );
}
