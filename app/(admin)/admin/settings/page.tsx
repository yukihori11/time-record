import 'server-only';

import AppHeader from '@/app/components/layout/AppHeader';
import { guardAdminPage } from '@/app/lib/server/page-guard';
import SettingsView from './SettingsView';

export const metadata = { title: '設定 | 民泊勤怠管理' };

// 管理者以外には枠も見せない。ここで転送するため、
// 権限が無い相手には HTML そのものが返らない。
export default async function SettingsPage() {
  await guardAdminPage('/admin/settings');

  return (
    <>
      <AppHeader title="設定" subtitle="給与ルール・棟・権限" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <SettingsView />
      </main>
    </>
  );
}
