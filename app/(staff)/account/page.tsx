import AppHeader from '@/app/components/layout/AppHeader';
import AccountView from './AccountView';

export const metadata = { title: '設定 | 民泊勤怠管理' };

export default function AccountPage() {
  return (
    <>
      <AppHeader title="設定" subtitle="通知・氏名・パスワード" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <AccountView />
      </main>
    </>
  );
}
