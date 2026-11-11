import { describe, expect, it } from 'vitest';
import type { ReservationType, Schedule, Stay } from '@/app/types/domain';
import {
  addMonths,
  cleaningCountOf,
  monthsBetween,
  nightsInMonth,
  occupancyOf,
  perUnit,
  stayStatsOf,
} from './analytics';

function stay(over: Partial<Stay>): Stay {
  return {
    id: 'S',
    propertyId: 'P1',
    kind: 'reserved',
    checkIn: '2026-11-10',
    checkOut: '2026-11-12',
    reservationCode: null,
    guestCount: null,
    note: null,
    ...over,
  };
}

describe('addMonths / monthsBetween', () => {
  it('年をまたいで月を足し引きする', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('両端を含む月の一覧', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthsBetween('2026-11', '2026-11')).toEqual(['2026-11']);
  });
});

describe('nightsInMonth', () => {
  it('月の中に収まる宿泊は泊数そのまま', () => {
    expect(nightsInMonth({ checkIn: '2026-11-10', checkOut: '2026-11-12' }, '2026-11')).toBe(2);
  });

  it('月末にチェックインして翌月に出る宿泊は、月末の夜だけ数える', () => {
    // 11/30 の夜だけが11月、12/1 の夜は12月
    const s = { checkIn: '2026-11-30', checkOut: '2026-12-02' };
    expect(nightsInMonth(s, '2026-11')).toBe(1);
    expect(nightsInMonth(s, '2026-12')).toBe(1);
  });

  it('月初にチェックアウトする宿泊は、チェックアウト日の夜を数えない', () => {
    expect(nightsInMonth({ checkIn: '2026-10-30', checkOut: '2026-11-01' }, '2026-11')).toBe(0);
    expect(nightsInMonth({ checkIn: '2026-10-30', checkOut: '2026-11-01' }, '2026-10')).toBe(2);
  });

  it('月をまるごとまたぐ宿泊は月の日数', () => {
    expect(nightsInMonth({ checkIn: '2026-10-25', checkOut: '2026-12-05' }, '2026-11')).toBe(30);
  });
});

describe('occupancyOf', () => {
  it('予約の泊数 ÷ 月の日数', () => {
    const o = occupancyOf([stay({ checkIn: '2026-11-01', checkOut: '2026-11-16' })], '2026-11');
    expect(o).toEqual({ bookedNights: 15, blockedNights: 0, availableNights: 30, rate: 0.5 });
  });

  it('ブロックは分母から除く', () => {
    const o = occupancyOf(
      [
        stay({ id: 'r', checkIn: '2026-11-01', checkOut: '2026-11-11' }),
        stay({ id: 'b', kind: 'blocked', checkIn: '2026-11-21', checkOut: '2026-12-01' }),
      ],
      '2026-11'
    );
    expect(o.bookedNights).toBe(10);
    expect(o.blockedNights).toBe(10);
    expect(o.availableNights).toBe(20);
    expect(o.rate).toBe(0.5);
  });

  it('全部ブロックなら稼働率は出さない（0% と区別する）', () => {
    const o = occupancyOf([stay({ kind: 'blocked', checkIn: '2026-11-01', checkOut: '2026-12-01' })], '2026-11');
    expect(o.rate).toBeNull();
  });

  it('宿泊が無ければ 0%', () => {
    expect(occupancyOf([], '2026-11').rate).toBe(0);
  });
});

describe('stayStatsOf', () => {
  it('その月にチェックインした予約の数と平均泊数', () => {
    const s = stayStatsOf(
      [
        stay({ id: 'a', checkIn: '2026-11-01', checkOut: '2026-11-02' }),
        stay({ id: 'b', checkIn: '2026-11-05', checkOut: '2026-11-08' }),
        // 前月にチェックインした分は数えない
        stay({ id: 'c', checkIn: '2026-10-30', checkOut: '2026-11-01' }),
        stay({ id: 'blk', kind: 'blocked', checkIn: '2026-11-20', checkOut: '2026-11-25' }),
      ],
      '2026-11'
    );
    expect(s.checkIns).toBe(2);
    expect(s.avgNights).toBe(2);
  });

  it('前の客が出た日に入る予約を入れ替えとして数える', () => {
    const s = stayStatsOf(
      [
        stay({ id: 'a', checkIn: '2026-10-30', checkOut: '2026-11-01' }),
        stay({ id: 'b', checkIn: '2026-11-01', checkOut: '2026-11-03' }), // 入れ替え
        stay({ id: 'c', checkIn: '2026-11-05', checkOut: '2026-11-07' }), // 空きあり
      ],
      '2026-11'
    );
    expect(s.turnovers).toBe(1);
  });

  it('予約が無ければ平均泊数は出さない', () => {
    expect(stayStatsOf([], '2026-11')).toEqual({ checkIns: 0, avgNights: null, turnovers: 0 });
  });
});

describe('cleaningCountOf', () => {
  const types = [
    { id: 'T-CLEAN', isCleaning: true },
    { id: 'T-STAY', isCleaning: false },
  ] as ReservationType[];
  const sc = (over: Partial<Schedule>): Schedule => ({
    id: 'X',
    propertyId: 'P1',
    typeId: 'T-CLEAN',
    guestCount: 0,
    scheduleDate: '2026-11-10',
    status: 'confirmed',
    ...over,
  });

  it('その月の、取り消していない清掃だけを数える', () => {
    const schedules = [
      sc({ id: 'a' }),
      sc({ id: 'b', scheduleDate: '2026-11-30' }),
      sc({ id: 'c', status: 'cancelled' }),
      sc({ id: 'd', typeId: 'T-STAY' }),
      sc({ id: 'e', scheduleDate: '2026-12-01' }),
    ];
    expect(cleaningCountOf(schedules, types, '2026-11')).toBe(2);
  });
});

describe('perUnit', () => {
  it('分母が 0 なら null', () => {
    expect(perUnit(10000, 0)).toBeNull();
    expect(perUnit(10000, 4)).toBe(2500);
  });
});
