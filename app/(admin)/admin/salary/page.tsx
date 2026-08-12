import 'server-only';

import AppHeader from '@/app/components/layout/AppHeader';
import { guardAdminPage } from '@/app/lib/server/page-guard';
import AdminSalaryView from './AdminSalaryView';

export const metadata = { title: '給与集計 | 民泊勤怠管理' };

// 管理者以外には枠も見せない。ここで転送するため、
// 権限が無い相手には HTML そのものが返らない。
export default async function AdminSalaryPage() {
  await guardAdminPage('/admin/salary');

  return (
    <>
      <AppHeader title="給与集計" subtitle="全スタッフの月次支給額" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <AdminSalaryView />
      </main>
    </>
  );
}
