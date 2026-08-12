import 'server-only';

import AppHeader from '@/app/components/layout/AppHeader';
import { guardAdminPage } from '@/app/lib/server/page-guard';
import AttendanceView from './AttendanceView';

export const metadata = { title: '勤怠管理 | 民泊勤怠管理' };

// 管理者以外には枠も見せない。ここで転送するため、
// 権限が無い相手には HTML そのものが返らない。
export default async function AttendancePage() {
  await guardAdminPage('/admin/attendance');

  return (
    <>
      <AppHeader title="勤怠管理" subtitle="打刻の確認・修正" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <AttendanceView />
      </main>
    </>
  );
}
