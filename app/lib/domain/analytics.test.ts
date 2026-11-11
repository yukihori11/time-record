import { describe, expect, it } from 'vitest';
import type { ReservationType, Schedule, Shift, Stay } from '@/app/types/domain';
import {
  addMonths,
  cleaningCountOf,
  cleaningDurationOf,
  cleaningsByStaff,
  guestStatsOf,
  revenueOf,
  weekdayOccupancy,
  laborInRange,
  monthsBetween,
  monthsOfRange,
  nightsInRange,
  parseRange,
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

  const accepted = (reservationId: string) => ({ reservationId, status: 'accepted' as const });

  it('その月の、取り消していない清掃だけを数える', () => {
    const schedules = [
      sc({ id: 'a' }),
      sc({ id: 'b', scheduleDate: '2026-11-30' }),
      sc({ id: 'c', status: 'cancelled' }),
      sc({ id: 'd', typeId: 'T-STAY' }),
      sc({ id: 'e', scheduleDate: '2026-12-01' }),
    ];
    const shifts = ['a', 'b', 'c', 'd', 'e'].map(accepted);
    expect(cleaningCountOf(schedules, types, shifts, '2026-11')).toBe(2);
  });

  it('承諾したスタッフがいない清掃は数えない（未回答・辞退・担当なし）', () => {
    const schedules = [sc({ id: 'ok' }), sc({ id: 'pending' }), sc({ id: 'declined' }), sc({ id: 'none' })];
    const shifts = [
      accepted('ok'),
      { reservationId: 'pending', status: 'assigned' as const },
      { reservationId: 'declined', status: 'declined' as const },
    ];
    expect(cleaningCountOf(schedules, types, shifts, '2026-11')).toBe(1);
  });

  it('2人で入っても1回と数える', () => {
    expect(cleaningCountOf([sc({ id: 'a' })], types, [accepted('a'), accepted('a')], '2026-11')).toBe(1);
  });
});

describe('perUnit', () => {
  it('分母が 0 なら null', () => {
    expect(perUnit(10000, 0)).toBeNull();
    expect(perUnit(10000, 4)).toBe(2500);
  });
});

describe('期間での集計（10/15〜11/15 など）', () => {
  const range = { from: '2026-10-15', to: '2026-11-15' };

  it('期間の両端を含めて泊数を数える', () => {
    // 10/14 の夜は外、10/15 の夜から数える
    expect(nightsInRange({ checkIn: '2026-10-14', checkOut: '2026-10-17' }, range)).toBe(2);
    // 11/15 の夜は含む、11/16 の夜は外
    expect(nightsInRange({ checkIn: '2026-11-15', checkOut: '2026-11-17' }, range)).toBe(1);
    // チェックアウトが 10/15 なら期間内の夜は無い
    expect(nightsInRange({ checkIn: '2026-10-13', checkOut: '2026-10-15' }, range)).toBe(0);
  });

  it('稼働率の分母は期間の日数（32日）', () => {
    const o = occupancyOf([stay({ checkIn: '2026-10-15', checkOut: '2026-10-31' })], range);
    expect(o.availableNights).toBe(32);
    expect(o.bookedNights).toBe(16);
    expect(o.rate).toBe(0.5);
  });

  it('予約の傾向は、期間内にチェックインした予約だけ', () => {
    const s = stayStatsOf(
      [
        stay({ id: 'a', checkIn: '2026-10-14', checkOut: '2026-10-16' }),
        stay({ id: 'b', checkIn: '2026-10-15', checkOut: '2026-10-18' }),
        stay({ id: 'c', checkIn: '2026-11-15', checkOut: '2026-11-16' }),
        stay({ id: 'd', checkIn: '2026-11-16', checkOut: '2026-11-18' }),
      ],
      range
    );
    expect(s.checkIns).toBe(2);
    expect(s.avgNights).toBe(2);
  });

  it('期間が含む月', () => {
    expect(monthsOfRange(range)).toEqual(['2026-10', '2026-11']);
  });

  it('人件費は期間に入る日だけを足す（月の給与計算の結果から切り出す）', () => {
    const days = [
      { workDate: '2026-10-14', amount: 5000, actualWorkMs: 3_600_000, hourlyWage: 1200 },
      { workDate: '2026-10-15', amount: 6000, actualWorkMs: 7_200_000, hourlyWage: 1200 },
      { workDate: '2026-11-15', amount: 4000, actualWorkMs: 3_600_000, hourlyWage: null },
      { workDate: '2026-11-16', amount: 9999, actualWorkMs: 3_600_000, hourlyWage: 1200 },
    ];
    expect(laborInRange(days, range)).toEqual({
      amount: 10000,
      workMs: 10_800_000,
      days: 2,
      missingWageDays: 1,
    });
  });
});

describe('parseRange', () => {
  it('正しい期間はそのまま返す', () => {
    expect(parseRange('2026-10-15', '2026-11-15')).toEqual({ from: '2026-10-15', to: '2026-11-15' });
    expect(parseRange('2026-11-15', '2026-11-15')).toEqual({ from: '2026-11-15', to: '2026-11-15' });
  });

  it('形のおかしい日付・実在しない日付・逆順は弾く', () => {
    expect(parseRange(undefined, '2026-11-15')).toBeNull();
    expect(parseRange('2026/10/15', '2026-11-15')).toBeNull();
    expect(parseRange('2026-02-30', '2026-03-05')).toBeNull();
    expect(parseRange('2026-11-16', '2026-11-15')).toBeNull();
  });

  it('長すぎる期間は弾く（1年＋1日）', () => {
    expect(parseRange('2026-01-01', '2026-12-31')).not.toBeNull(); // 365日
    expect(parseRange('2026-01-01', '2027-01-01')).not.toBeNull(); // 366日
    expect(parseRange('2026-01-01', '2027-01-02')).toBeNull(); // 367日
  });
});

describe('weekdayOccupancy', () => {
  // 2026-11-02 は月曜。1週間（月〜日）
  const week = { from: '2026-11-02', to: '2026-11-08' };

  it('曜日ごとに、その夜が埋まっているかを数える', () => {
    // 金曜(11/6)にチェックインして2泊 → 金・土の夜
    const r = weekdayOccupancy([stay({ checkIn: '2026-11-06', checkOut: '2026-11-08' })], ['P1'], week);
    expect(r[5]).toEqual({ weekday: 5, bookedNights: 1, availableNights: 1, rate: 1 });
    expect(r[6].rate).toBe(1);
    expect(r[0].rate).toBe(0); // 日曜の夜（チェックアウト日）は空き
    expect(r[1].rate).toBe(0);
  });

  it('ブロックの夜は分母から除く', () => {
    const r = weekdayOccupancy(
      [stay({ kind: 'blocked', checkIn: '2026-11-02', checkOut: '2026-11-03' })],
      ['P1'],
      week
    );
    expect(r[1].availableNights).toBe(0);
    expect(r[1].rate).toBeNull();
  });

  it('棟が2つなら分母も2倍', () => {
    const r = weekdayOccupancy(
      [stay({ propertyId: 'P1', checkIn: '2026-11-06', checkOut: '2026-11-07' })],
      ['P1', 'P2'],
      week
    );
    expect(r[5]).toMatchObject({ bookedNights: 1, availableNights: 2, rate: 0.5 });
  });
});

describe('guestStatsOf', () => {
  const range = { from: '2026-11-01', to: '2026-11-30' };

  it('延べ人数・平均人数・定員に対する割合', () => {
    const g = guestStatsOf(
      [
        stay({ id: 'a', checkIn: '2026-11-01', checkOut: '2026-11-03', guestCount: 4 }), // 4人×2泊
        stay({ id: 'b', checkIn: '2026-11-10', checkOut: '2026-11-11', guestCount: 2 }), // 2人×1泊
        stay({ id: 'c', checkIn: '2026-11-20', checkOut: '2026-11-21', guestCount: null }),
      ],
      4,
      range
    );
    expect(g.checkIns).toBe(3);
    expect(g.entered).toBe(2);
    expect(g.avgGuests).toBe(3);
    expect(g.guestNights).toBe(10);
    // 定員 4 × 入力済みの泊数 3 = 12 に対して 10
    expect(g.capacityFill).toBeCloseTo(10 / 12);
  });

  it('定員が未設定なら割合は出さない', () => {
    const g = guestStatsOf([stay({ guestCount: 2 })], null, range);
    expect(g.capacityFill).toBeNull();
  });
});

describe('revenueOf', () => {
  it('金額を1泊あたりに割り、期間に入る泊数の分だけ数える', () => {
    // 10/30〜11/02 の3泊（10/30・10/31・11/1 の夜）で 30000円
    // → 11月分は 11/1 の1泊 = 10000円、10月分は 2泊 = 20000円
    const s3 = [stay({ checkIn: '2026-10-30', checkOut: '2026-11-02', amount: 30000 })];
    expect(revenueOf(s3, { from: '2026-11-01', to: '2026-11-30' })).toEqual({
      revenue: 10000,
      nightsWithAmount: 1,
      bookedNights: 1,
      adr: 10000,
    });
    expect(revenueOf(s3, { from: '2026-10-01', to: '2026-10-31' }).revenue).toBe(20000);
  });

  it('金額が未入力の予約は売上に入れないが、泊数には数える（入力率を出すため）', () => {
    const r = revenueOf(
      [
        stay({ id: 'a', checkIn: '2026-11-01', checkOut: '2026-11-03', amount: 20000 }),
        stay({ id: 'b', checkIn: '2026-11-10', checkOut: '2026-11-12', amount: null }),
        stay({ id: 'blk', kind: 'blocked', checkIn: '2026-11-20', checkOut: '2026-11-22', amount: 99999 }),
      ],
      { from: '2026-11-01', to: '2026-11-30' }
    );
    expect(r.revenue).toBe(20000);
    expect(r.nightsWithAmount).toBe(2);
    expect(r.bookedNights).toBe(4);
    expect(r.adr).toBe(10000);
  });

  it('入力が無ければ単価は出さない', () => {
    expect(revenueOf([stay({ amount: null })], { from: '2026-11-01', to: '2026-11-30' }).adr).toBeNull();
  });
});

describe('cleaningDurationOf / cleaningsByStaff', () => {
  const types = [
    { id: 'T-CLEAN', isCleaning: true },
    { id: 'T-MAINT', isCleaning: false },
  ] as ReservationType[];
  const range = { from: '2026-11-01', to: '2026-11-30' };
  const sc = (id: string, over: Partial<Schedule> = {}): Schedule => ({
    id,
    propertyId: 'P1',
    typeId: 'T-CLEAN',
    guestCount: 0,
    scheduleDate: '2026-11-10',
    status: 'confirmed',
    ...over,
  });
  const sh = (userId: string, reservationId: string | null, over: Partial<Shift> = {}) => ({
    userId,
    shiftDate: '2026-11-10',
    reservationId,
    status: 'accepted' as const,
    ...over,
  });
  const H = 3_600_000;

  it('清掃だけの日は、勤務時間をその日の清掃の数で割る', () => {
    const schedules = [sc('c1'), sc('c2', { propertyId: 'P2' })];
    const shifts = [sh('U1', 'c1'), sh('U1', 'c2')];
    const work = new Map([['U1|2026-11-10', 3 * H]]);
    const d = cleaningDurationOf(schedules, types, shifts, work, range);
    expect(d.samples).toBe(2);
    expect(d.avgPerPersonMs).toBe(1.5 * H);
    expect(d.avgPerCleaningMs).toBe(1.5 * H);
  });

  it('2人で入った清掃は、延べ時間を足す', () => {
    const shifts = [sh('U1', 'c1'), sh('U2', 'c1')];
    const work = new Map([
      ['U1|2026-11-10', 2 * H],
      ['U2|2026-11-10', 1 * H],
    ]);
    const d = cleaningDurationOf([sc('c1')], types, shifts, work, range);
    expect(d.avgPerPersonMs).toBe(1.5 * H);
    expect(d.avgPerCleaningMs).toBe(3 * H);
    expect(d.byProperty).toEqual([{ propertyId: 'P1', cleanings: 1, avgPerCleaningMs: 3 * H }]);
  });

  it('清掃以外のシフトもあった日・打刻が無い日・未承諾は外す', () => {
    const schedules = [sc('c1'), sc('m1', { typeId: 'T-MAINT' }), sc('c2', { scheduleDate: '2026-11-11' }), sc('c3')];
    const shifts = [
      sh('U1', 'c1'),
      sh('U1', 'm1'), // 同じ日にメンテナンス → U1 の 11/10 は外す
      sh('U2', 'c2', { shiftDate: '2026-11-11' }), // 打刻なし
      sh('U3', 'c3', { status: 'assigned' }), // 未承諾
    ];
    const work = new Map([['U1|2026-11-10', 4 * H], ['U3|2026-11-10', 1 * H]]);
    const d = cleaningDurationOf(schedules, types, shifts, work, range);
    expect(d.samples).toBe(0);
    expect(d.avgPerPersonMs).toBeNull();
  });

  it('スタッフごとの清掃の回数（承諾したものだけ）', () => {
    const schedules = [sc('c1'), sc('c2'), sc('m1', { typeId: 'T-MAINT' })];
    const shifts = [sh('U1', 'c1'), sh('U1', 'c2'), sh('U1', 'm1'), sh('U2', 'c1', { status: 'declined' })];
    const map = cleaningsByStaff(schedules, types, shifts, range);
    expect(map.get('U1')).toBe(2);
    expect(map.get('U2')).toBeUndefined();
  });
});
