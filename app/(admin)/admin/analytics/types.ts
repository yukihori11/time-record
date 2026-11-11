import type { Occupancy, StayStats } from '@/app/lib/domain/analytics';

/** 分析画面に渡すデータ。集計はサーバー側で済ませ、画面は表示だけを行う */
export interface AnalyticsData {
  /** 今月 'YYYY-MM' */
  currentMonth: string;
  /** 表示できる月（古い順）。先の月も含む */
  months: string[];
  /** 取り込んだ宿泊の最初の月。これより前は宿泊のデータが無い */
  firstStayMonth: string | null;
  /** 読み込めなかったデータの知らせ */
  warnings: string[];
  properties: { id: string; name: string; color: string }[];
  byMonth: MonthAnalytics[];
}

export interface MonthAnalytics {
  month: string;
  /** 今月より先の月。人件費は出さない */
  isFuture: boolean;
  perProperty: { propertyId: string; occupancy: Occupancy; stats: StayStats }[];
  /** 人件費の合計。先の月は null */
  laborTotal: number | null;
  laborByStaff: {
    userId: string;
    name: string;
    amount: number;
    workMs: number;
    days: number;
    missingWageDays: number;
  }[];
  cleanings: number;
  laborPerCleaning: number | null;
}
