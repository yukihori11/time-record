import type {
  Property,
  Reservation,
  ReservationType,
  Shift,
} from '@/app/types/domain';
import { addDays, diffDays } from './datetime';

/**
 * 予約がその日にかかっているか。
 *
 * 宿泊は [開始日, 終了日) の半開区間。終了日の朝に出るため
 * その日は泊まっていない。
 * 作業（開始日 = 終了日）は当日のみ。
 */
export function isActiveOn(reservation: Reservation, date: string): boolean {
  if (reservation.checkOut === reservation.checkIn) {
    return reservation.checkIn === date;
  }
  return reservation.checkIn <= date && date < reservation.checkOut;
}

/** その日に終了（チェックアウト）する予約か */
export function isCheckOutDay(reservation: Reservation, date: string): boolean {
  return (
    reservation.checkOut !== reservation.checkIn &&
    reservation.checkOut === date
  );
}

/**
 * カレンダー上の帯（バー）1本分。
 *
 * 連泊は週をまたぐことがあるため、週ごとに分割して
 * 「その週の何列目から何列分か」を持たせる。
 */
export interface ReservationBar {
  reservation: Reservation;
  property: Property | undefined;
  type: ReservationType | undefined;
  /** 週の何列目から始まるか（0=日曜） */
  startCol: number;
  /** 何列分の幅か */
  span: number;
  /** 予約の実際の開始日がこの週にあるか（左端を丸めるかの判定） */
  isStart: boolean;
  /** 予約の実際の終了日がこの週にあるか */
  isEnd: boolean;
  /** 縦方向の段。帯が重ならないように割り当てる */
  lane: number;
}

export interface WeekRow {
  /** その週の7日分の日付。月外は null */
  days: (string | null)[];
  bars: ReservationBar[];
}

/**
 * 予約が実際に占有する最終日を返す。
 *
 * 宿泊 8/15〜8/18 は 8/17 までが宿泊日（8/18は朝に出る）。
 * 作業 8/15〜8/15 は 8/15 のみ。
 */
function lastOccupiedDate(r: Reservation): string {
  if (r.checkOut === r.checkIn) return r.checkIn;
  return addDays(r.checkOut, -1);
}

/**
 * 月カレンダーを週単位に分割し、各週で帯を配置する。
 *
 * 帯が縦に重ならないよう lane を割り当てる。
 * 同じ予約が週をまたぐ場合は、週ごとに別の帯として切り出す。
 */
export function buildWeeks(
  month: string,
  reservations: Reservation[],
  properties: Property[],
  types: ReservationType[]
): WeekRow[] {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();

  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  const typeMap = new Map(types.map((t) => [t.id, t]));

  // 月全体をセル配列にし、7日ずつの週に切る
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: WeekRow[] = [];

  for (let w = 0; w < cells.length / 7; w++) {
    const days = cells.slice(w * 7, w * 7 + 7);
    const realDays = days.filter((d): d is string => d !== null);

    if (realDays.length === 0) {
      weeks.push({ days, bars: [] });
      continue;
    }

    const weekStart = realDays[0];
    const weekEnd = realDays[realDays.length - 1];

    // この週にかかる予約を集める
    const active = reservations
      .filter((r) => r.status === 'confirmed')
      .filter((r) => {
        const last = lastOccupiedDate(r);
        return r.checkIn <= weekEnd && last >= weekStart;
      })
      // 期間の長いものを上の段に置くと見やすい
      .sort((a, b) => {
        const lenA = diffDays(a.checkIn, lastOccupiedDate(a));
        const lenB = diffDays(b.checkIn, lastOccupiedDate(b));
        if (lenA !== lenB) return lenB - lenA;
        return a.checkIn.localeCompare(b.checkIn);
      });

    // 各段の使用済み列を記録し、空いている段に配置する
    const lanes: boolean[][] = [];
    const bars: ReservationBar[] = [];

    for (const r of active) {
      const last = lastOccupiedDate(r);

      const barStart = r.checkIn > weekStart ? r.checkIn : weekStart;
      const barEnd = last < weekEnd ? last : weekEnd;

      const startCol = days.indexOf(barStart);
      const endCol = days.indexOf(barEnd);
      if (startCol < 0 || endCol < 0) continue;

      const span = endCol - startCol + 1;

      // 重ならない段を探す
      let lane = 0;
      for (;;) {
        if (!lanes[lane]) lanes[lane] = new Array(7).fill(false);
        const free = lanes[lane]
          .slice(startCol, startCol + span)
          .every((used) => !used);
        if (free) break;
        lane++;
      }
      for (let c = startCol; c < startCol + span; c++) lanes[lane][c] = true;

      bars.push({
        reservation: r,
        property: propertyMap.get(r.propertyId),
        type: typeMap.get(r.typeId),
        startCol,
        span,
        isStart: r.checkIn >= weekStart,
        isEnd: last <= weekEnd,
        lane,
      });
    }

    weeks.push({ days, bars });
  }

  return weeks;
}

export interface DayDetailData {
  date: string;
  reservations: {
    reservation: Reservation;
    property: Property | undefined;
    type: ReservationType | undefined;
    nightNumber: number;
    totalNights: number;
    isStart: boolean;
    isLastNight: boolean;
  }[];
  checkOuts: Reservation[];
  shifts: Shift[];
  totalGuests: number;
}

/** 指定日の詳細を組み立てる */
export function buildDayDetail(
  date: string,
  reservations: Reservation[],
  properties: Property[],
  types: ReservationType[],
  shifts: Shift[]
): DayDetailData {
  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  const typeMap = new Map(types.map((t) => [t.id, t]));

  const active = reservations
    .filter((r) => r.status === 'confirmed' && isActiveOn(r, date))
    .map((r) => {
      const totalNights =
        r.checkOut === r.checkIn ? 1 : diffDays(r.checkIn, r.checkOut);
      return {
        reservation: r,
        property: propertyMap.get(r.propertyId),
        type: typeMap.get(r.typeId),
        nightNumber: diffDays(r.checkIn, date) + 1,
        totalNights,
        isStart: r.checkIn === date,
        isLastNight: lastOccupiedDate(r) === date,
      };
    })
    .sort(
      (a, b) =>
        (a.property?.displayOrder ?? 99) - (b.property?.displayOrder ?? 99)
    );

  return {
    date,
    reservations: active,
    checkOuts: reservations.filter(
      (r) => r.status === 'confirmed' && isCheckOutDay(r, date)
    ),
    shifts: shifts.filter((s) => s.shiftDate === date),
    // 客が滞在する種別だけを数える
    totalGuests: active
      .filter((a) => a.type?.hasGuests !== false)
      .reduce((sum, a) => sum + a.reservation.guestCount, 0),
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
