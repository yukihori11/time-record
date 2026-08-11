import type { Property, Reservation, Shift } from '@/app/types/domain';
import { diffDays } from './datetime';

export interface DayOccupancy {
  date: string;
  /** その日に滞在している予約（棟ごと） */
  stays: {
    reservation: Reservation;
    property: Property | undefined;
    /** 何泊目か（1始まり） */
    nightNumber: number;
    isCheckIn: boolean;
    /** 翌日チェックアウト（= 最終泊） */
    isLastNight: boolean;
  }[];
  totalGuests: number;
  shifts: Shift[];
}

/**
 * 指定日に滞在中かを判定する。
 *
 * 民泊は [チェックイン, チェックアウト) の半開区間。
 * チェックアウト日は「その日の朝に出ていく」ので宿泊としては数えない。
 */
export function isStaying(reservation: Reservation, date: string): boolean {
  return reservation.checkIn <= date && date < reservation.checkOut;
}

/** その日にチェックアウトする予約か */
export function isCheckOutDay(reservation: Reservation, date: string): boolean {
  return reservation.checkOut === date;
}

/**
 * 日ごとの稼働状況を組み立てる。
 *
 * カレンダーの各マスに「どの棟に何人いるか」を出すために使う。
 */
export function buildOccupancy(
  dates: string[],
  reservations: Reservation[],
  properties: Property[],
  shifts: Shift[] = []
): DayOccupancy[] {
  const propertyMap = new Map(properties.map((p) => [p.id, p]));

  return dates.map((date) => {
    const stays = reservations
      .filter((r) => r.status === 'confirmed' && isStaying(r, date))
      .map((reservation) => ({
        reservation,
        property: propertyMap.get(reservation.propertyId),
        nightNumber: diffDays(reservation.checkIn, date) + 1,
        isCheckIn: reservation.checkIn === date,
        isLastNight: diffDays(date, reservation.checkOut) === 1,
      }))
      .sort(
        (a, b) =>
          (a.property?.displayOrder ?? 99) - (b.property?.displayOrder ?? 99)
      );

    return {
      date,
      stays,
      totalGuests: stays.reduce((sum, s) => sum + s.reservation.guestCount, 0),
      shifts: shifts.filter((s) => s.shiftDate === date),
    };
  });
}

/** その日にチェックアウトする予約（詳細表示用） */
export function checkOutsOn(
  reservations: Reservation[],
  date: string
): Reservation[] {
  return reservations.filter(
    (r) => r.status === 'confirmed' && isCheckOutDay(r, date)
  );
}
