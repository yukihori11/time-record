import { describe, expect, it } from 'vitest';
import type {
  Property,
  Reservation,
  ReservationType,
  Shift,
} from '@/app/types/domain';
import {
  buildDayDetail,
  buildWeeks,
  isActiveOn,
  isCheckOutDay,
  shiftSummary,
} from './occupancy';

const PROPERTIES: Property[] = [
  { id: 'P1', name: 'A棟', color: '#3b82f6', isActive: true, displayOrder: 1 },
  { id: 'P2', name: 'B棟', color: '#f97316', isActive: true, displayOrder: 2 },
];

const TYPES: ReservationType[] = [
  {
    id: 'T-STAY',
    name: '宿泊',
    color: '#3b82f6',
    icon: '🛏',
    hasGuests: true,
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'T-CLEAN',
    name: '清掃',
    color: '#10b981',
    icon: '🧹',
    hasGuests: false,
    isActive: true,
    displayOrder: 2,
  },
];

function stay(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'R1',
    propertyId: 'P1',
    typeId: 'T-STAY',
    guestCount: 3,
    checkIn: '2026-08-15',
    checkOut: '2026-08-18',
    nights: 3,
    status: 'confirmed',
    ...overrides,
  };
}

/** 清掃など、その日限りの作業 */
function work(date: string, overrides: Partial<Reservation> = {}): Reservation {
  return stay({
    id: `W-${date}`,
    typeId: 'T-CLEAN',
    guestCount: 0,
    checkIn: date,
    checkOut: date,
    nights: 0,
    ...overrides,
  });
}

// ============================================================
describe('isActiveOn', () => {
  const r = stay(); // 8/15 IN, 8/18 OUT

  it('チェックイン日から最終泊まで滞在中', () => {
    expect(isActiveOn(r, '2026-08-15')).toBe(true);
    expect(isActiveOn(r, '2026-08-16')).toBe(true);
    expect(isActiveOn(r, '2026-08-17')).toBe(true);
  });

  it('チェックアウト日は滞在中ではない（朝に出るため）', () => {
    expect(isActiveOn(r, '2026-08-18')).toBe(false);
  });

  it('期間外は false', () => {
    expect(isActiveOn(r, '2026-08-14')).toBe(false);
    expect(isActiveOn(r, '2026-08-19')).toBe(false);
  });

  it('1日で完結する作業は当日のみ', () => {
    const w = work('2026-08-20');
    expect(isActiveOn(w, '2026-08-20')).toBe(true);
    expect(isActiveOn(w, '2026-08-19')).toBe(false);
    expect(isActiveOn(w, '2026-08-21')).toBe(false);
  });
});

describe('isCheckOutDay', () => {
  it('宿泊のチェックアウト日を判定する', () => {
    expect(isCheckOutDay(stay(), '2026-08-18')).toBe(true);
    expect(isCheckOutDay(stay(), '2026-08-17')).toBe(false);
  });

  it('1日で完結する作業はチェックアウト扱いにしない', () => {
    expect(isCheckOutDay(work('2026-08-20'), '2026-08-20')).toBe(false);
  });
});

// ============================================================
describe('buildWeeks', () => {
  it('月を週単位に分割する', () => {
    // 2026-08-01 は土曜日
    const weeks = buildWeeks('2026-08', [], PROPERTIES, TYPES);
    expect(weeks.length).toBeGreaterThanOrEqual(5);
    expect(weeks[0].days).toHaveLength(7);
    // 1日が土曜なので最初の6セルは空
    expect(weeks[0].days.slice(0, 6).every((d) => d === null)).toBe(true);
    expect(weeks[0].days[6]).toBe('2026-08-01');
  });

  it('連泊を1本の帯にする', () => {
    // 8/16(日)〜8/19(水) の3泊。同じ週に収まる
    const weeks = buildWeeks(
      '2026-08',
      [stay({ checkIn: '2026-08-16', checkOut: '2026-08-19' })],
      PROPERTIES,
      TYPES
    );

    const bars = weeks.flatMap((w) => w.bars);
    expect(bars).toHaveLength(1);
    // 8/16(日)から8/18(火)までの3日分
    expect(bars[0].startCol).toBe(0);
    expect(bars[0].span).toBe(3);
    expect(bars[0].isStart).toBe(true);
    expect(bars[0].isEnd).toBe(true);
  });

  it('週をまたぐ連泊は2本に分割し、切れ目を示す', () => {
    // 8/14(金)〜8/18(火)。8/15(土)で週が変わる
    const weeks = buildWeeks(
      '2026-08',
      [stay({ checkIn: '2026-08-14', checkOut: '2026-08-18' })],
      PROPERTIES,
      TYPES
    );

    const bars = weeks.flatMap((w) => w.bars);
    expect(bars).toHaveLength(2);

    // 前半は開始側なので左端が丸く、右は続く
    expect(bars[0].isStart).toBe(true);
    expect(bars[0].isEnd).toBe(false);

    // 後半は続きなので左は角ばり、右端が終わり
    expect(bars[1].isStart).toBe(false);
    expect(bars[1].isEnd).toBe(true);
  });

  it('重なる予約を別々の段に配置する', () => {
    const weeks = buildWeeks(
      '2026-08',
      [
        stay({ id: 'R1', propertyId: 'P1', checkIn: '2026-08-16', checkOut: '2026-08-19' }),
        stay({ id: 'R2', propertyId: 'P2', checkIn: '2026-08-17', checkOut: '2026-08-20' }),
      ],
      PROPERTIES,
      TYPES
    );

    const bars = weeks.flatMap((w) => w.bars);
    const lanes = new Set(bars.map((b) => b.lane));
    expect(lanes.size).toBe(2);
  });

  it('重ならない予約は同じ段を再利用する', () => {
    const weeks = buildWeeks(
      '2026-08',
      [
        stay({ id: 'R1', checkIn: '2026-08-16', checkOut: '2026-08-17' }),
        stay({ id: 'R2', propertyId: 'P2', checkIn: '2026-08-19', checkOut: '2026-08-20' }),
      ],
      PROPERTIES,
      TYPES
    );

    const bars = weeks.flatMap((w) => w.bars);
    expect(bars.every((b) => b.lane === 0)).toBe(true);
  });

  it('キャンセルされた予約は帯にしない', () => {
    const weeks = buildWeeks(
      '2026-08',
      [stay({ status: 'cancelled' })],
      PROPERTIES,
      TYPES
    );
    expect(weeks.flatMap((w) => w.bars)).toHaveLength(0);
  });

  it('1日だけの作業も帯になる', () => {
    const weeks = buildWeeks('2026-08', [work('2026-08-20')], PROPERTIES, TYPES);
    const bars = weeks.flatMap((w) => w.bars);
    expect(bars).toHaveLength(1);
    expect(bars[0].span).toBe(1);
    expect(bars[0].type?.name).toBe('清掃');
  });

  it('前月から続く予約も当月分だけ帯にする', () => {
    const weeks = buildWeeks(
      '2026-08',
      [stay({ checkIn: '2026-07-30', checkOut: '2026-08-03' })],
      PROPERTIES,
      TYPES
    );

    const bars = weeks.flatMap((w) => w.bars);
    expect(bars.length).toBeGreaterThan(0);
    // 月初から始まるので「続き」扱い
    expect(bars[0].isStart).toBe(false);
  });
});

// ============================================================
describe('buildDayDetail', () => {
  const shifts: Shift[] = [
    {
      id: 'S1',
      userId: 'U1',
      propertyId: 'P1',
      reservationId: 'R1',
      shiftDate: '2026-08-15',
      startTime: '10:00',
      endTime: null,
      status: 'accepted',
      respondedAt: null,
    },
    {
      id: 'S2',
      userId: 'U2',
      propertyId: 'P1',
      reservationId: 'R1',
      shiftDate: '2026-08-16',
      startTime: '09:00',
      endTime: null,
      status: 'assigned',
      respondedAt: null,
    },
  ];

  it('その日の予定とシフトを集める', () => {
    const detail = buildDayDetail(
      '2026-08-15',
      [stay()],
      PROPERTIES,
      TYPES,
      shifts
    );

    expect(detail.reservations).toHaveLength(1);
    expect(detail.reservations[0].nightNumber).toBe(1);
    expect(detail.reservations[0].totalNights).toBe(3);
    expect(detail.reservations[0].isStart).toBe(true);
    expect(detail.shifts).toHaveLength(1);
    expect(detail.shifts[0].startTime).toBe('10:00');
  });

  it('最終泊を判定する', () => {
    const detail = buildDayDetail(
      '2026-08-17',
      [stay()],
      PROPERTIES,
      TYPES,
      []
    );
    expect(detail.reservations[0].isLastNight).toBe(true);
    expect(detail.reservations[0].nightNumber).toBe(3);
  });

  it('客が滞在しない種別は人数に数えない', () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [work('2026-08-20', { guestCount: 0 })],
      PROPERTIES,
      TYPES,
      []
    );
    expect(detail.reservations).toHaveLength(1);
    expect(detail.totalGuests).toBe(0);
  });

  it('宿泊と作業が同じ日に共存できる', () => {
    const detail = buildDayDetail(
      '2026-08-15',
      [stay(), work('2026-08-15', { propertyId: 'P2' })],
      PROPERTIES,
      TYPES,
      []
    );
    expect(detail.reservations).toHaveLength(2);
    // 宿泊の3名のみカウント
    expect(detail.totalGuests).toBe(3);
  });

  it('チェックアウトを別枠で返す', () => {
    const detail = buildDayDetail(
      '2026-08-18',
      [stay()],
      PROPERTIES,
      TYPES,
      []
    );
    expect(detail.reservations).toHaveLength(0);
    expect(detail.checkOuts).toHaveLength(1);
  });
});

describe('shiftSummary', () => {
  it('回答状況を集計する', () => {
    const summary = shiftSummary([
      { status: 'accepted' },
      { status: 'assigned' },
      { status: 'assigned' },
      { status: 'declined' },
    ] as Shift[]);

    expect(summary).toEqual({
      total: 4,
      accepted: 1,
      pending: 2,
      declined: 1,
    });
  });
});
