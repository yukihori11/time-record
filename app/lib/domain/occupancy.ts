import type {
  Property,
  ReservationType,
  Schedule,
  Shift,
} from '@/app/types/domain';

/**
 * カレンダーに出す1件分の予定。
 *
 * 予定は1日で完結するため、期間の計算や帯の配置は不要。
 */
export interface ScheduleEntry {
  schedule: Schedule;
  property: Property | undefined;
  type: ReservationType | undefined;
}

/** 日付ごとに予定をまとめる */
export function schedulesByDate(
  schedules: Schedule[],
  properties: Property[],
  types: ReservationType[]
): Map<string, ScheduleEntry[]> {
  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  const typeMap = new Map(types.map((t) => [t.id, t]));

  const result = new Map<string, ScheduleEntry[]>();

  for (const s of schedules) {
    if (s.status !== 'confirmed') continue;

    const entry: ScheduleEntry = {
      schedule: s,
      property: propertyMap.get(s.propertyId),
      type: typeMap.get(s.typeId),
    };

    const list = result.get(s.scheduleDate);
    if (list) list.push(entry);
    else result.set(s.scheduleDate, [entry]);
  }

  // 棟の表示順に並べる
  for (const list of result.values()) {
    list.sort(
      (a, b) =>
        (a.property?.displayOrder ?? 99) - (b.property?.displayOrder ?? 99)
    );
  }

  return result;
}

/** 月のカレンダーに並べる日付。月外は null */
export function calendarCells(month: string): (string | null)[] {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  // 最終週を7日で埋める
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

export interface DayDetailData {
  date: string;
  schedules: ScheduleEntry[];
  shifts: Shift[];
  /** 客が滞在する種別の人数合計 */
  totalGuests: number;
}

/** 指定日の詳細を組み立てる */
export function buildDayDetail(
  date: string,
  schedules: Schedule[],
  properties: Property[],
  types: ReservationType[],
  shifts: Shift[]
): DayDetailData {
  const byDate = schedulesByDate(schedules, properties, types);
  const entries = byDate.get(date) ?? [];

  return {
    date,
    schedules: entries,
    shifts: shifts.filter((s) => s.shiftDate === date),
    totalGuests: entries
      .filter((e) => e.type?.hasGuests !== false)
      .reduce((sum, e) => sum + e.schedule.guestCount, 0),
  };
}

/** その日にシフトが入っている人数（承諾状況ごと） */
export function shiftSummary(shifts: Shift[]) {
  return {
    total: shifts.length,
    accepted: shifts.filter((s) => s.status === 'accepted').length,
    pending: shifts.filter((s) => s.status === 'assigned').length,
    declined: shifts.filter((s) => s.status === 'declined').length,
  };
}

/** カレンダーのマスに出す、その日のシフト1件分 */
export interface DayShiftLabel {
  id: string;
  userId: string;
  name: string;
  startTime: string | null;
  status: Shift['status'];
}

/** 日付ごとのシフトを、表示用の名前つきで引けるようにする */
export function shiftsByDate(
  shifts: Shift[],
  users: { id: string; name: string; email: string }[]
): Map<string, DayShiftLabel[]> {
  const userMap = new Map(users.map((u) => [u.id, u]));
  const result = new Map<string, DayShiftLabel[]>();

  for (const s of shifts) {
    const user = userMap.get(s.userId);
    const label: DayShiftLabel = {
      id: s.id,
      userId: s.userId,
      // 表示は姓だけにして幅を稼ぐ（「田中 太郎」→「田中」）
      name: (user?.name || user?.email || 'スタッフ').split(/[\s　]/)[0],
      startTime: s.startTime,
      status: s.status,
    };

    const list = result.get(s.shiftDate);
    if (list) list.push(label);
    else result.set(s.shiftDate, [label]);
  }

  // 入り時間の早い順に並べる
  for (const list of result.values()) {
    list.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  }

  return result;
}
