import AppHeader from '@/app/components/layout/AppHeader';
import ShiftsView from './ShiftsView';

export const metadata = { title: 'シフト | 民泊勤怠管理' };

export default function ShiftsPage() {
  return (
    <>
      <AppHeader title="シフト" subtitle="承諾・辞退の回答" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <ShiftsView />
      </main>
    </>
  );
}
