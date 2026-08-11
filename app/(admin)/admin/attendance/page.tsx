import AppHeader from '@/app/components/layout/AppHeader';
import AttendanceView from './AttendanceView';

export const metadata = { title: '勤怠管理 | 民泊勤怠管理' };

export default function AttendancePage() {
  return (
    <>
      <AppHeader title="勤怠管理" subtitle="打刻の確認・修正" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <AttendanceView />
      </main>
    </>
  );
}
