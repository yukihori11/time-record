import type { ReservationType, Schedule, Shift, Stay } from '@/app/types/domain';
import { addDays, diffDays } from './datetime';

// Airbnb から取り込んだ宿泊の判定と、カレンダーに帯を並べる計算。
// 画面や DB から切り離してあるのでテストで確かめられる。

// ------------------------------------------------------------
// 取り込み
// ------------------------------------------------------------

export interface ExistingStayRow {
  id: string;
  icalUid: string;
  status: 'active' | 'cancelled';
  checkOut: string;
}

export interface CancellationPlan {
  cancelIds: string[];
  /** 安全のためキャンセルを見送ったか */
  skipped: boolean;
}

/**
 * iCal から消えた宿泊のうち、キャンセル扱いにするものを決める。
 *
 * 過去の宿泊は Airbnb の出力期間から外れて消えるだけなので触らない。
 * iCal に予定が1件も無いときは、取得側の不調の可能性が高いため
 * 何もキャンセルしない（Airbnb は売り止め期間も出すので通常は空にならない）。
 * 「残っている予約が全部消えたら見送る」とはしない。閑散期に
 * 唯一の予約がキャンセルされると、いつまでも消えなくなるため。
 */
export function planCancellations(
  existing: ExistingStayRow[],
  feedUids: Set<string>,
  today: string
): CancellationPlan {
  const targets = existing.filter(
    (row) =>
      row.status === 'active' &&
      row.checkOut >= today &&
      !feedUids.has(row.icalUid)
  );

  if (targets.length === 0) return { cancelIds: [], skipped: false };

  if (feedUids.size === 0) {
    return { cancelIds: [], skipped: true };
  }

  return { cancelIds: targets.map((row) => row.id), skipped: false };
}

// ------------------------------------------------------------
// チェックイン当日の清掃
// ------------------------------------------------------------

/**
 * ready      清掃の予定があり、担当が承諾済み
 * unassigned 清掃の予定はあるが、承諾した担当がいない
 * missing    清掃の予定が無い
 */
export type CleaningStatus = 'ready' | 'unassigned' | 'missing';

/** 清掃はチェックイン当日に行う。その日・その棟の清掃の予定を見る */
export function cleaningStatus(
  stay: Pick<Stay, 'propertyId' | 'checkIn'>,
  schedules: Schedule[],
  types: ReservationType[],
  shifts: Shift[]
): CleaningStatus {
  const cleaningTypeIds = new Set(
    types.filter((t) => t.isCleaning).map((t) => t.id)
  );

  const cleanings = schedules.filter(
    (s) =>
      s.status === 'confirmed' &&
      s.scheduleDate === stay.checkIn &&
      s.propertyId === stay.propertyId &&
      cleaningTypeIds.has(s.typeId)
  );
  if (cleanings.length === 0) return 'missing';

  const ids = new Set(cleanings.map((s) => s.id));
  const accepted = shifts.some(
    (sh) =>
      sh.reservationId !== null &&
      ids.has(sh.reservationId) &&
      sh.status === 'accepted'
  );
  return accepted ? 'ready' : 'unassigned';
}

/** チェックインがある宿泊を日付ごとにまとめる（ブロックは除く） */
export function checkInsByDate(stays: Stay[]): Map<string, Stay[]> {
  const result = new Map<string, Stay[]>();
  for (const s of stays) {
    if (s.kind !== 'reserved') continue;
    const list = result.get(s.checkIn);
    if (list) list.push(s);
    else result.set(s.checkIn, [s]);
  }
  return result;
}

/** 指定日に関わる宿泊（チェックイン・滞在中・チェックアウト） */
export function staysOnDate(stays: Stay[], date: string) {
  const reserved = stays.filter((s) => s.kind === 'reserved');
  return {
    checkIns: reserved.filter((s) => s.checkIn === date),
    staying: reserved.filter((s) => s.checkIn < date && date < s.checkOut),
    checkOuts: reserved.filter((s) => s.checkOut === date),
    // ブロックは終わりの日（DTEND）は売り止めに含まれない
    blocks: stays.filter(
      (s) => s.kind === 'blocked' && s.checkIn <= date && date < s.checkOut
    ),
  };
}

// ------------------------------------------------------------
// カレンダーの帯
// ------------------------------------------------------------

export interface StayBar {
  stay: Stay;
  /** 週の左端からの位置（0〜7。1が1日分） */
  start: number;
  end: number;
  /** この週の中でチェックインするか（帯の左端に印を付ける） */
  startsHere: boolean;
  endsHere: boolean;
}

/**
 * 1週間分の帯の位置を棟ごとに求める。
 *
 * Airbnb のカレンダーと同じく、帯はチェックイン日の真ん中から
 * チェックアウト日の真ん中まで引く。入れ替えの日は前の帯の終わりと
 * 次の帯の始まりが同じマスに並ぶので、その日に出入りがあると分かる。
 */
export function weekStayBars(
  weekStart: string,
  stays: Stay[]
): Map<string, StayBar[]> {
  const result = new Map<string, StayBar[]>();

  for (const stay of stays) {
    const rawStart = diffDays(weekStart, stay.checkIn) + 0.5;
    const rawEnd = diffDays(weekStart, stay.checkOut) + 0.5;
    if (rawEnd <= 0 || rawStart >= 7) continue;

    const bar: StayBar = {
      stay,
      start: Math.max(0, rawStart),
      end: Math.min(7, rawEnd),
      startsHere: rawStart >= 0,
      endsHere: rawEnd <= 7,
    };

    const list = result.get(stay.propertyId);
    if (list) list.push(bar);
    else result.set(stay.propertyId, [bar]);
  }

  return result;
}

/**
 * calendarCells の結果を週ごとに区切る。
 * 月の外の空きマスにも日付を入れ、帯を月をまたいで描けるようにする。
 */
export function calendarWeeks(
  cells: (string | null)[]
): { weekStart: string; days: { date: string; inMonth: boolean }[] }[] {
  const firstIndex = cells.findIndex((c) => c !== null);
  if (firstIndex < 0) return [];
  const origin = addDays(cells[firstIndex] as string, -firstIndex);

  const weeks: { weekStart: string; days: { date: string; inMonth: boolean }[] }[] = [];
  for (let w = 0; w * 7 < cells.length; w++) {
    const weekStart = addDays(origin, w * 7);
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: addDays(weekStart, i),
      inMonth: cells[w * 7 + i] != null,
    }));
    weeks.push({ weekStart, days });
  }
  return weeks;
}

// ------------------------------------------------------------
// スタッフに見せる範囲
// ------------------------------------------------------------

/**
 * スタッフ向けに、自分にお願いされた分だけに絞る。
 * 予定の一覧 API など、スタッフが呼べる他の窓口でも同じ考え方で絞っている。
 */
export function scopeToStaff(
  userId: string,
  shifts: Shift[],
  schedules: Schedule[],
  stays: Stay[]
): { shifts: Shift[]; schedules: Schedule[]; stays: Stay[] } {
  const mine = shifts.filter((s) => s.userId === userId);
  const scheduleIds = new Set(
    mine.map((s) => s.reservationId).filter((id): id is string => id !== null)
  );
  const dayProperty = new Set(
    mine.filter((s) => s.propertyId).map((s) => `${s.shiftDate}|${s.propertyId}`)
  );

  return {
    shifts: mine,
    schedules: schedules.filter((s) => scheduleIds.has(s.id)),
    stays: stays.filter(
      (st) => st.kind === 'reserved' && dayProperty.has(`${st.checkIn}|${st.propertyId}`)
    ),
  };
}

// ------------------------------------------------------------
// ホームに出すチェックインの一覧
// ------------------------------------------------------------

export interface CheckInItem {
  stay: Stay;
  cleaning: CleaningStatus;
  /** 同じ棟で前の宿泊が同じ日にチェックアウトする（清掃できる時間が短い） */
  isTurnover: boolean;
}

/** 指定日のチェックインを、清掃の状態と入れ替えの有無つきで並べる */
export function checkInsOn(
  date: string,
  stays: Stay[],
  schedules: Schedule[],
  types: ReservationType[],
  shifts: Shift[],
  propertyOrder: string[]
): CheckInItem[] {
  const reserved = stays.filter((s) => s.kind === 'reserved');
  const order = new Map(propertyOrder.map((id, i) => [id, i]));

  return reserved
    .filter((s) => s.checkIn === date)
    .map((stay) => ({
      stay,
      cleaning: cleaningStatus(stay, schedules, types, shifts),
      isTurnover: reserved.some(
        (o) => o.id !== stay.id && o.propertyId === stay.propertyId && o.checkOut === date
      ),
    }))
    .sort(
      (a, b) =>
        (order.get(a.stay.propertyId) ?? 99) - (order.get(b.stay.propertyId) ?? 99)
    );
}

// ------------------------------------------------------------
// Airbnb の予約ページ
// ------------------------------------------------------------

/**
 * 予約コードから Airbnb のホスト向け予約ページの URL を作る。
 * iCal には人数が無いので、ここから Airbnb を開いて確かめてもらう。
 * ホストのアカウントでしか開けないため、管理者にだけ出す。
 */
export function airbnbReservationUrl(code: string | null): string | null {
  if (!code || !/^[A-Z0-9]{6,20}$/i.test(code)) return null;
  return `https://www.airbnb.com/hosting/reservations/details/${code.toUpperCase()}`;
}
