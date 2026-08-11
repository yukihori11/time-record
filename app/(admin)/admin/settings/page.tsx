import AppHeader from '@/app/components/layout/AppHeader';
import SettingsView from './SettingsView';

export const metadata = { title: '設定 | 民泊勤怠管理' };

export default function SettingsPage() {
  return (
    <>
      <AppHeader title="設定" subtitle="給与ルール・棟・権限" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <SettingsView />
      </main>
    </>
  );
}
