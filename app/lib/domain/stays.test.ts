import { describe, expect, it } from 'vitest';
import type { ReservationType, Schedule, Shift, Stay } from '@/app/types/domain';
import {
  airbnbReservationUrl,
  calendarWeeks,
  checkInsByDate,
  checkInsOn,
  cleaningStatus,
  planCancellations,
  scopeToStaff,
  staysOnDate,
  weekStayBars,
} from './stays';
import { calendarCells } from './occupancy';

function stay(over: Partial<Stay>): Stay {
  return {
    id: 'S1',
    propertyId: 'P1',
    kind: 'reserved',
    checkIn: '2026-10-10',
    checkOut: '2026-10-12',
    reservationCode: null,
    guestCount: null,
    note: null,
    ...over,
  };
}

describe('planCancellations', () => {
  const today = '2026-10-05';
  const rows = [
    { id: 'past', icalUid: 'u-past', status: 'active' as const, checkOut: '2026-10-01' },
    { id: 'keep', icalUid: 'u-keep', status: 'active' as const, checkOut: '2026-10-20' },
    { id: 'gone', icalUid: 'u-gone', status: 'active' as const, checkOut: '2026-10-25' },
    { id: 'done', icalUid: 'u-done', status: 'cancelled' as const, checkOut: '2026-10-28' },
  ];

  it('iCal から消えた未来の予約だけキャンセルする', () => {
    expect(planCancellations(rows, new Set(['u-keep']), today)).toEqual({
      cancelIds: ['gone'],
      skipped: false,
    });
  });

  it('過去の宿泊は消えても触らない', () => {
    const plan = planCancellations(rows, new Set(['u-keep', 'u-gone']), today);
    expect(plan.cancelIds).toEqual([]);
  });

  it('今日チェックアウトの宿泊はまだ未来として扱う', () => {
    const r = [{ id: 'x', icalUid: 'u-x', status: 'active' as const, checkOut: today }];
    expect(planCancellations(r, new Set(['other']), today).cancelIds).toEqual(['x']);
  });

  it('iCal が空なら何もキャンセルしない', () => {
    expect(planCancellations(rows, new Set(), today)).toEqual({
      cancelIds: [],
      skipped: true,
    });
  });

  it('残っていた予約が1件だけでも、消えればキャンセルする', () => {
    const r = [{ id: 'only', icalUid: 'u-only', status: 'active' as const, checkOut: '2026-11-01' }];
    expect(planCancellations(r, new Set(['u-block']), today).cancelIds).toEqual(['only']);
  });
});

describe('cleaningStatus', () => {
  const types: ReservationType[] = [
    { id: 'T-CLEAN', name: '清掃・作業', color: '#10b981', icon: '🧹', hasGuests: false, isCleaning: true, isActive: true, displayOrder: 2 },
    { id: 'T-PREP', name: '準備', color: '#f59e0b', icon: '📦', hasGuests: false, isCleaning: false, isActive: true, displayOrder: 3 },
  ];
  const s = stay({ propertyId: 'P1', checkIn: '2026-10-10' });

  function schedule(over: Partial<Schedule>): Schedule {
    return { id: 'R1', propertyId: 'P1', typeId: 'T-CLEAN', guestCount: 0, scheduleDate: '2026-10-10', status: 'confirmed', ...over };
  }
  function shift(over: Partial<Shift>): Shift {
    return {
      id: 'SH1', userId: 'U1', propertyId: 'P1', reservationId: 'R1', shiftDate: '2026-10-10',
      startTime: null, endTime: null, status: 'accepted', respondedAt: null, declineReason: null, note: null,
      ...over,
    } as Shift;
  }

  it('清掃の予定が無ければ missing', () => {
    expect(cleaningStatus(s, [], types, [])).toBe('missing');
  });

  it('別の日・別の棟・清掃以外の種別・取り消し済みは数えない', () => {
    const schedules = [
      schedule({ id: 'a', scheduleDate: '2026-10-09' }),
      schedule({ id: 'b', propertyId: 'P2' }),
      schedule({ id: 'c', typeId: 'T-PREP' }),
      schedule({ id: 'd', status: 'cancelled' }),
    ];
    expect(cleaningStatus(s, schedules, types, [])).toBe('missing');
  });

  it('予定はあるが承諾した担当がいなければ unassigned', () => {
    expect(cleaningStatus(s, [schedule({})], types, [])).toBe('unassigned');
    expect(cleaningStatus(s, [schedule({})], types, [shift({ status: 'assigned' })])).toBe('unassigned');
    expect(cleaningStatus(s, [schedule({})], types, [shift({ status: 'declined' })])).toBe('unassigned');
  });

  it('担当が承諾していれば ready', () => {
    expect(cleaningStatus(s, [schedule({})], types, [shift({})])).toBe('ready');
  });
});

describe('checkInsByDate / staysOnDate', () => {
  const stays = [
    stay({ id: 'a', propertyId: 'P1', checkIn: '2026-10-10', checkOut: '2026-10-12' }),
    stay({ id: 'b', propertyId: 'P2', checkIn: '2026-10-10', checkOut: '2026-10-13' }),
    stay({ id: 'c', propertyId: 'P1', checkIn: '2026-10-12', checkOut: '2026-10-14' }),
    stay({ id: 'blk', propertyId: 'P2', kind: 'blocked', checkIn: '2026-10-13', checkOut: '2026-10-20' }),
  ];

  it('同じ日に2棟のチェックインがあると2件になる', () => {
    expect(checkInsByDate(stays).get('2026-10-10')?.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('ブロックはチェックインに数えない', () => {
    expect(checkInsByDate(stays).has('2026-10-13')).toBe(false);
  });

  it('入れ替えの日はチェックアウトとチェックインの両方に出る', () => {
    const d = staysOnDate(stays, '2026-10-12');
    expect(d.checkOuts.map((s) => s.id)).toEqual(['a']);
    expect(d.checkIns.map((s) => s.id)).toEqual(['c']);
    expect(d.staying.map((s) => s.id)).toEqual(['b']);
  });
});

describe('weekStayBars', () => {
  // 2026-10-04 は日曜
  const weekStart = '2026-10-04';

  it('チェックイン日の真ん中からチェックアウト日の真ん中まで引く', () => {
    const bars = weekStayBars(weekStart, [stay({ checkIn: '2026-10-05', checkOut: '2026-10-07' })]);
    expect(bars.get('P1')).toEqual([
      expect.objectContaining({ start: 1.5, end: 3.5, startsHere: true, endsHere: true }),
    ]);
  });

  it('週をまたぐ宿泊は端で切る', () => {
    const bars = weekStayBars(weekStart, [stay({ checkIn: '2026-10-01', checkOut: '2026-10-13' })]);
    expect(bars.get('P1')).toEqual([
      expect.objectContaining({ start: 0, end: 7, startsHere: false, endsHere: false }),
    ]);
  });

  it('土曜チェックアウトの帯は週の中で終わる', () => {
    const bars = weekStayBars(weekStart, [stay({ checkIn: '2026-10-08', checkOut: '2026-10-10' })]);
    expect(bars.get('P1')?.[0]).toEqual(expect.objectContaining({ end: 6.5, endsHere: true }));
  });

  it('週に掛からない宿泊は出さない', () => {
    const bars = weekStayBars(weekStart, [
      stay({ id: 'before', checkIn: '2026-09-30', checkOut: '2026-10-04' }),
      stay({ id: 'after', checkIn: '2026-10-11', checkOut: '2026-10-12' }),
    ]);
    // 10/4 チェックアウトは日曜の真ん中まで残る
    expect(bars.get('P1')?.map((b) => b.stay.id)).toEqual(['before']);
  });
});

describe('calendarWeeks', () => {
  it('月の外の空きマスにも日付を入れる', () => {
    // 2026年10月は木曜始まり
    const weeks = calendarWeeks(calendarCells('2026-10'));
    expect(weeks[0].weekStart).toBe('2026-09-27');
    expect(weeks[0].days[0]).toEqual({ date: '2026-09-27', inMonth: false });
    expect(weeks[0].days[4]).toEqual({ date: '2026-10-01', inMonth: true });
  });
});

describe('scopeToStaff', () => {
  function shift(over: Partial<Shift>): Shift {
    return {
      id: 'x', userId: 'ME', propertyId: 'P1', reservationId: null, shiftDate: '2026-10-10',
      startTime: null, endTime: null, status: 'assigned', respondedAt: null, declineReason: null, note: null,
      ...over,
    } as Shift;
  }
  function schedule(id: string): Schedule {
    return { id, propertyId: 'P1', typeId: 'T', guestCount: 0, scheduleDate: '2026-10-10', status: 'confirmed' };
  }

  const shifts = [
    shift({ id: 'mine', userId: 'ME', reservationId: 'R-MINE', propertyId: 'P1', shiftDate: '2026-10-10' }),
    shift({ id: 'other', userId: 'OTHER', reservationId: 'R-OTHER', propertyId: 'P2', shiftDate: '2026-10-10' }),
  ];
  const schedules = [schedule('R-MINE'), schedule('R-OTHER'), schedule('R-NOBODY')];
  const stays = [
    stay({ id: 'mine-in', propertyId: 'P1', checkIn: '2026-10-10', checkOut: '2026-10-12' }),
    stay({ id: 'other-prop', propertyId: 'P2', checkIn: '2026-10-10', checkOut: '2026-10-12' }),
    stay({ id: 'other-day', propertyId: 'P1', checkIn: '2026-10-12', checkOut: '2026-10-14' }),
    stay({ id: 'blocked', propertyId: 'P1', kind: 'blocked', checkIn: '2026-10-10', checkOut: '2026-10-11' }),
  ];

  const scoped = scopeToStaff('ME', shifts, schedules, stays);

  it('シフトは自分のものだけ', () => {
    expect(scoped.shifts.map((s) => s.id)).toEqual(['mine']);
  });

  it('予定は自分のシフトが紐づくものだけ', () => {
    expect(scoped.schedules.map((s) => s.id)).toEqual(['R-MINE']);
  });

  it('宿泊は自分のシフトがある日・棟にチェックインするものだけ。ブロックは出さない', () => {
    expect(scoped.stays.map((s) => s.id)).toEqual(['mine-in']);
  });

  it('シフトが無ければ何も返さない', () => {
    const none = scopeToStaff('NOBODY', shifts, schedules, stays);
    expect(none).toEqual({ shifts: [], schedules: [], stays: [] });
  });
});

describe('checkInsOn', () => {
  const types: ReservationType[] = [
    { id: 'T-CLEAN', name: 'チェックイン清掃', color: '#8b5cf6', icon: '🧹', hasGuests: false, isCleaning: true, isActive: true, displayOrder: 1 },
  ];
  const stays = [
    stay({ id: 'b-in', propertyId: 'P2', checkIn: '2026-10-10', checkOut: '2026-10-12' }),
    stay({ id: 'a-in', propertyId: 'P1', checkIn: '2026-10-10', checkOut: '2026-10-11' }),
    stay({ id: 'a-prev', propertyId: 'P1', checkIn: '2026-10-08', checkOut: '2026-10-10' }),
    stay({ id: 'blk', propertyId: 'P2', kind: 'blocked', checkIn: '2026-10-05', checkOut: '2026-10-10' }),
  ];
  const schedules: Schedule[] = [
    { id: 'R1', propertyId: 'P1', typeId: 'T-CLEAN', guestCount: 0, scheduleDate: '2026-10-10', status: 'confirmed' },
  ];

  const items = checkInsOn('2026-10-10', stays, schedules, types, [], ['P1', 'P2']);

  it('その日のチェックインだけを棟の順に並べる', () => {
    expect(items.map((i) => i.stay.id)).toEqual(['a-in', 'b-in']);
  });

  it('前の宿泊が同じ日に出るなら入れ替え。ブロックの終わりは入れ替えにしない', () => {
    expect(items.map((i) => i.isTurnover)).toEqual([true, false]);
  });

  it('清掃の状態を付ける', () => {
    expect(items.map((i) => i.cleaning)).toEqual(['unassigned', 'missing']);
  });
});

describe('airbnbReservationUrl', () => {
  it('予約コードから予約ページの URL を作る', () => {
    expect(airbnbReservationUrl('HMABCD1234')).toBe(
      'https://www.airbnb.com/hosting/reservations/details/HMABCD1234'
    );
  });

  it('コードが無い・形がおかしいときは作らない', () => {
    expect(airbnbReservationUrl(null)).toBeNull();
    expect(airbnbReservationUrl('')).toBeNull();
    expect(airbnbReservationUrl('HM/../x')).toBeNull();
    expect(airbnbReservationUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('staysOnDate のブロック', () => {
  const stays = [stay({ id: 'blk', kind: 'blocked', checkIn: '2026-10-07', checkOut: '2026-10-10' })];
  it('売り止めの期間中の日に出る。終わりの日は売り止めに含まれない', () => {
    expect(staysOnDate(stays, '2026-10-07').blocks.map((s) => s.id)).toEqual(['blk']);
    expect(staysOnDate(stays, '2026-10-09').blocks.map((s) => s.id)).toEqual(['blk']);
    expect(staysOnDate(stays, '2026-10-10').blocks).toEqual([]);
  });
});
