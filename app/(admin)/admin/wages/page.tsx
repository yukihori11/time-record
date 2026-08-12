import 'server-only';

import AppHeader from '@/app/components/layout/AppHeader';
import { guardAdminPage } from '@/app/lib/server/page-guard';
import WagesView from './WagesView';

export const metadata = { title: '時給設定 | 民泊勤怠管理' };

// 管理者以外には枠も見せない。ここで転送するため、
// 権限が無い相手には HTML そのものが返らない。
export default async function WagesPage() {
  await guardAdminPage('/admin/wages');

  return (
    <>
      <AppHeader title="時給設定" subtitle="スタッフごと・履歴つき" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <WagesView />
      </main>
    </>
  );
}
