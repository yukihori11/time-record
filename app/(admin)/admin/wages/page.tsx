import AppHeader from '@/app/components/layout/AppHeader';
import WagesView from './WagesView';

export const metadata = { title: '時給設定 | 民泊勤怠管理' };

export default function WagesPage() {
  return (
    <>
      <AppHeader title="時給設定" subtitle="スタッフごと・履歴つき" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <WagesView />
      </main>
    </>
  );
}
