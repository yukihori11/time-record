import { describe, expect, it } from 'vitest';
import type { Property, Reservation } from '@/app/types/domain';
import { buildOccupancy, checkOutsOn, isStaying } from './occupancy';

const PROPERTIES: Property[] = [
  {
    id: 'P1',
    name: 'A棟',
    color: '#3b82f6',
    isActive: true,
    displayOrder: 1,
    capacity: 6,
  },
  {
    id: 'P2',
    name: 'B棟',
    color: '#f97316',
    isActive: true,
    displayOrder: 2,
    capacity: 4,
  },
];

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'R1',
    propertyId: 'P1',
    guestName: '山田',
    guestCount: 3,
    checkIn: '2026-08-15',
    checkOut: '2026-08-18',
    nights: 3,
    status: 'confirmed',
    ...overrides,
  };
}

describe('isStaying', () => {
  const r = reservation(); // 8/15 IN, 8/18 OUT

  it('チェックイン日は滞在中', () => {
    expect(isStaying(r, '2026-08-15')).toBe(true);
  });

  it('中日は滞在中', () => {
    expect(isStaying(r, '2026-08-16')).toBe(true);
    expect(isStaying(r, '2026-08-17')).toBe(true);
  });

  it('チェックアウト日は滞在中ではない（朝に出るため）', () => {
    expect(isStaying(r, '2026-08-18')).toBe(false);
  });

  it('前日・翌日は滞在中ではない', () => {
    expect(isStaying(r, '2026-08-14')).toBe(false);
    expect(isStaying(r, '2026-08-19')).toBe(false);
  });
});

describe('buildOccupancy', () => {
  it('棟ごとの人数を日別に集計する', () => {
    const reservations = [
      reservation({ id: 'R1', propertyId: 'P1', guestCount: 4 }),
      reservation({
        id: 'R2',
        propertyId: 'P2',
        guestCount: 2,
        checkIn: '2026-08-16',
        checkOut: '2026-08-17',
      }),
    ];

    const days = buildOccupancy(
      ['2026-08-15', '2026-08-16', '2026-08-17'],
      reservations,
      PROPERTIES
    );

    expect(days[0].totalGuests).toBe(4); // A棟のみ
    expect(days[1].totalGuests).toBe(6); // A棟+B棟
    expect(days[2].totalGuests).toBe(4); // B棟はチェックアウト済み
  });

  it('何泊目かを正しく数える', () => {
    const days = buildOccupancy(
      ['2026-08-15', '2026-08-16', '2026-08-17'],
      [reservation()],
      PROPERTIES
    );

    expect(days[0].stays[0].nightNumber).toBe(1);
    expect(days[1].stays[0].nightNumber).toBe(2);
    expect(days[2].stays[0].nightNumber).toBe(3);
  });

  it('チェックイン日と最終泊を判定する', () => {
    const days = buildOccupancy(
      ['2026-08-15', '2026-08-16', '2026-08-17'],
      [reservation()],
      PROPERTIES
    );

    expect(days[0].stays[0].isCheckIn).toBe(true);
    expect(days[0].stays[0].isLastNight).toBe(false);

    // 8/17 の翌日 8/18 がチェックアウト日
    expect(days[2].stays[0].isCheckIn).toBe(false);
    expect(days[2].stays[0].isLastNight).toBe(true);
  });

  it('1泊の予約はチェックイン日が最終泊', () => {
    const days = buildOccupancy(
      ['2026-08-15'],
      [reservation({ checkOut: '2026-08-16', nights: 1 })],
      PROPERTIES
    );

    expect(days[0].stays[0].isCheckIn).toBe(true);
    expect(days[0].stays[0].isLastNight).toBe(true);
  });

  it('キャンセルされた予約は数えない', () => {
    const days = buildOccupancy(
      ['2026-08-15'],
      [reservation({ status: 'cancelled' })],
      PROPERTIES
    );

    expect(days[0].totalGuests).toBe(0);
    expect(days[0].stays).toHaveLength(0);
  });

  it('棟の表示順に並べる', () => {
    const days = buildOccupancy(
      ['2026-08-15'],
      [
        reservation({ id: 'R2', propertyId: 'P2' }),
        reservation({ id: 'R1', propertyId: 'P1' }),
      ],
      PROPERTIES
    );

    expect(days[0].stays.map((s) => s.property?.name)).toEqual(['A棟', 'B棟']);
  });

  it('月をまたぐ予約も正しく扱う', () => {
    const days = buildOccupancy(
      ['2026-09-01', '2026-09-02'],
      [reservation({ checkIn: '2026-08-30', checkOut: '2026-09-02' })],
      PROPERTIES
    );

    expect(days[0].stays).toHaveLength(1);
    expect(days[0].stays[0].nightNumber).toBe(3); // 8/30から数えて3泊目
    expect(days[1].stays).toHaveLength(0); // 9/2はチェックアウト日
  });
});

describe('checkOutsOn', () => {
  it('その日にチェックアウトする予約を返す', () => {
    const list = [reservation()];
    expect(checkOutsOn(list, '2026-08-18')).toHaveLength(1);
    expect(checkOutsOn(list, '2026-08-17')).toHaveLength(0);
  });
});
