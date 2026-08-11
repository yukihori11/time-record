import { describe, expect, it } from 'vitest';
import type {
  Property,
  ReservationType,
  Schedule,
  Shift,
} from '@/app/types/domain';
import {
  buildDayDetail,
  calendarCells,
  schedulesByDate,
  shiftsByDate,
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

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'S1',
    propertyId: 'P1',
    typeId: 'T-STAY',
    guestCount: 3,
    scheduleDate: '2026-08-15',
    status: 'confirmed',
    ...overrides,
  };
}

// ============================================================
describe('calendarCells', () => {
  it('月初の曜日ぶんだけ空セルを置く', () => {
    // 2026-08-01 は土曜日（週の7列目）
    const cells = calendarCells('2026-08');
    expect(cells.slice(0, 6).every((c) => c === null)).toBe(true);
    expect(cells[6]).toBe('2026-08-01');
  });

  it('7の倍数になるよう末尾を埋める', () => {
    for (const month of ['2026-01', '2026-02', '2026-08', '2026-11']) {
      expect(calendarCells(month).length % 7).toBe(0);
    }
  });

  it('その月の日数ぶんの日付を含む', () => {
    const cells = calendarCells('2026-02').filter(Boolean);
    expect(cells).toHaveLength(28);
    expect(cells[0]).toBe('2026-02-01');
    expect(cells[27]).toBe('2026-02-28');
  });

  it('うるう年の2月は29日', () => {
    expect(calendarCells('2028-02').filter(Boolean)).toHaveLength(29);
  });
});

// ============================================================
describe('schedulesByDate', () => {
  it('日付ごとにまとめる', () => {
    const map = schedulesByDate(
      [
        schedule({ id: 'S1', scheduleDate: '2026-08-15' }),
        schedule({ id: 'S2', scheduleDate: '2026-08-15', propertyId: 'P2' }),
        schedule({ id: 'S3', scheduleDate: '2026-08-16' }),
      ],
      PROPERTIES,
      TYPES
    );

    expect(map.get('2026-08-15')).toHaveLength(2);
    expect(map.get('2026-08-16')).toHaveLength(1);
  });

  it('棟と種別を紐づける', () => {
    const map = schedulesByDate([schedule()], PROPERTIES, TYPES);
    const entry = map.get('2026-08-15')![0];

    expect(entry.property?.name).toBe('A棟');
    expect(entry.type?.name).toBe('宿泊');
  });

  it('棟の表示順に並べる', () => {
    const map = schedulesByDate(
      [
        schedule({ id: 'S2', propertyId: 'P2' }),
        schedule({ id: 'S1', propertyId: 'P1' }),
      ],
      PROPERTIES,
      TYPES
    );

    expect(map.get('2026-08-15')!.map((e) => e.property?.name)).toEqual([
      'A棟',
      'B棟',
    ]);
  });

  it('キャンセルされた予定は含めない', () => {
    const map = schedulesByDate(
      [schedule({ status: 'cancelled' })],
      PROPERTIES,
      TYPES
    );
    expect(map.size).toBe(0);
  });

  it('同じ日に宿泊と清掃が共存できる', () => {
    const map = schedulesByDate(
      [
        schedule({ id: 'S1', typeId: 'T-STAY' }),
        schedule({ id: 'S2', typeId: 'T-CLEAN', propertyId: 'P2' }),
      ],
      PROPERTIES,
      TYPES
    );
    expect(map.get('2026-08-15')).toHaveLength(2);
  });
});

// ============================================================
describe('buildDayDetail', () => {
  const shifts: Shift[] = [
    {
      id: 'SH1',
      userId: 'U1',
      propertyId: 'P1',
      reservationId: 'S1',
      shiftDate: '2026-08-15',
      startTime: '10:00',
      endTime: null,
      status: 'accepted',
      respondedAt: null,
    },
    {
      id: 'SH2',
      userId: 'U2',
      propertyId: 'P1',
      reservationId: null,
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
      [schedule()],
      PROPERTIES,
      TYPES,
      shifts
    );

    expect(detail.schedules).toHaveLength(1);
    expect(detail.shifts).toHaveLength(1);
    expect(detail.shifts[0].startTime).toBe('10:00');
  });

  it('別の日の予定は含めない', () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [schedule()],
      PROPERTIES,
      TYPES,
      shifts
    );
    expect(detail.schedules).toHaveLength(0);
    expect(detail.shifts).toHaveLength(0);
  });

  it('客が滞在する種別だけを人数に数える', () => {
    const detail = buildDayDetail(
      '2026-08-15',
      [
        schedule({ id: 'S1', typeId: 'T-STAY', guestCount: 4 }),
        schedule({
          id: 'S2',
          typeId: 'T-CLEAN',
          guestCount: 0,
          propertyId: 'P2',
        }),
      ],
      PROPERTIES,
      TYPES,
      []
    );

    expect(detail.schedules).toHaveLength(2);
    expect(detail.totalGuests).toBe(4);
  });
});

// ============================================================
describe('shiftsByDate', () => {
  const users = [
    { id: 'U1', name: '田中 太郎', email: 't@example.com' },
    { id: 'U2', name: '佐藤', email: 's@example.com' },
  ];

  const list: Shift[] = [
    {
      id: 'S1',
      userId: 'U1',
      propertyId: 'P1',
      reservationId: null,
      shiftDate: '2026-08-15',
      startTime: '13:00',
      endTime: null,
      status: 'accepted',
      respondedAt: null,
    },
    {
      id: 'S2',
      userId: 'U2',
      propertyId: 'P1',
      reservationId: null,
      shiftDate: '2026-08-15',
      startTime: '09:00',
      endTime: null,
      status: 'assigned',
      respondedAt: null,
    },
  ];

  it('日付ごとにまとめる', () => {
    expect(shiftsByDate(list, users).get('2026-08-15')).toHaveLength(2);
  });

  it('狭い幅に収まるよう姓だけにする', () => {
    const names = shiftsByDate(list, users)
      .get('2026-08-15')!
      .map((s) => s.name);
    expect(names).toContain('田中');
    expect(names).not.toContain('田中 太郎');
  });

  it('入り時間の早い順に並べる', () => {
    const times = shiftsByDate(list, users)
      .get('2026-08-15')!
      .map((s) => s.startTime);
    expect(times).toEqual(['09:00', '13:00']);
  });

  it('実績と突き合わせられるよう userId を持つ', () => {
    const first = shiftsByDate(list, users).get('2026-08-15')![0];
    expect(first.userId).toBe('U2');
  });

  it('該当ユーザーがいなくても落ちない', () => {
    expect(shiftsByDate(list, []).get('2026-08-15')![0].name).toBe('スタッフ');
  });
});

describe('shiftSummary', () => {
  it('回答状況を集計する', () => {
    expect(
      shiftSummary([
        { status: 'accepted' },
        { status: 'assigned' },
        { status: 'assigned' },
        { status: 'declined' },
      ] as Shift[])
    ).toEqual({ total: 4, accepted: 1, pending: 2, declined: 1 });
  });
});
