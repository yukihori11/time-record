import AppHeader from '@/app/components/layout/AppHeader';
import { getSalaryData } from '@/app/lib/server/queries';
import { todayJst } from '@/app/lib/domain/datetime';
import SalaryView from './SalaryView';

export const metadata = { title: '給与 | 民泊勤怠管理' };

export const dynamic = 'force-dynamic';

export default async function SalaryPage() {
  const month = todayJst().slice(0, 7);

  // 今月分はサーバーで取得して埋め込む。
  // 月を切り替えたときだけ API から取りに行く。
  const data = await getSalaryData(month);

  return (
    <>
      <AppHeader title="給与" subtitle="日別の金額と月合計" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <SalaryView
          initialMonth={month}
          initialSalary={data.salary}
          initialSettings={data.settings}
        />
      </main>
    </>
  );
}
