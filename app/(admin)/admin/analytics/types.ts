import type {
  CleaningDuration,
  DateRange,
  GuestStats,
  Occupancy,
  Revenue,
  StayStats,
  WeekdayOccupancy,
} from '@/app/lib/domain/analytics';

/** 分析画面に渡すデータ。集計はサーバー側で済ませ、画面は表示だけを行う */
export interface AnalyticsData {
  /** 今月 'YYYY-MM' */
  currentMonth: string;
  /** 表示できる月（古い順）。先の月も含む */
  months: string[];
  /** 取り込んだ宿泊の最初の日。これより前は宿泊のデータが無い */
  firstStayDate: string | null;
  /** 読み込めなかったデータの知らせ */
  warnings: string[];
  properties: { id: string; name: string; color: string; capacity: number | null }[];
  /** 金額の表（0031）が使えるか。false なら売上は出せない */
  revenueAvailable: boolean;
  /** 今日から 30/60/90 日先までの予約の入り具合 */
  forward: {
    days: number;
    from: string;
    to: string;
    rate: number | null;
    perProperty: { propertyId: string; occupancy: Occupancy }[];
  }[];
  byMonth: (Summary & { month: string })[];
  /** 期間を指定したときの集計。指定が無ければ null */
  range: (Summary & DateRange) | null;
  /** 期間の指定がおかしかったときの知らせ */
  rangeError: string | null;
}

/** 1つの期間（月、または指定した期間）の集計 */
export interface Summary {
  /** 今日より先の期間。人件費は出さない */
  isFuture: boolean;
  perProperty: {
    propertyId: string;
    occupancy: Occupancy;
    stats: StayStats;
    guests: GuestStats;
    revenue: Revenue;
  }[];
  /** 曜日ごとの稼働（全棟） */
  weekday: WeekdayOccupancy[];
  /** 1回の清掃にかかった時間。先の期間は null */
  cleaningDuration: CleaningDuration | null;
  /** 売上の合計（入力した金額の分だけ） */
  revenueTotal: number;
  /** 人件費 ÷ 売上。売上が無ければ null */
  laborRatio: number | null;
  /** 人件費の合計。先の期間は null */
  laborTotal: number | null;
  laborByStaff: {
    userId: string;
    name: string;
    amount: number;
    workMs: number;
    days: number;
    missingWageDays: number;
    /** 入った清掃の回数 */
    cleanings: number;
  }[];
  cleanings: number;
  laborPerCleaning: number | null;
}

/** 月ごとの集計 */
export type MonthAnalytics = Summary & { month: string };
