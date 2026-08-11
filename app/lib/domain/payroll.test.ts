import { describe, expect, it } from 'vitest';
import type {
  BreakRecord,
  HourlyWage,
  PayrollSettings,
  WorkSession,
} from '@/app/types/domain';
import {
  amountFromMinutes,
  calcDailySalary,
  calcMonthlySalary,
} from './payroll';
import { roundMinutes } from './rounding';
import { actualWorkMs, mergeIntervals, totalBreakMs } from './worktime';
import { resolveWage } from './wage-history';
import { availableActions, deriveClockState } from './session-state';

const NOW = new Date('2026-08-15T12:00:00+09:00');

// 既定は「15分単位・切り上げ・1時間15分を超えたら2時間分を保証」
const SETTINGS: PayrollSettings = {
  roundingMode: 'up',
  roundingMinutes: 15,
  guaranteeThresholdMinutes: 75,
  minGuaranteedMinutes: 120,
};

function session(
  overrides: Partial<WorkSession> & { clockIn: Date }
): WorkSession {
  return {
    id: 'S1',
    userId: 'U1',
    propertyId: null,
    workDate: '2026-08-15',
    clockOut: null,
    status: 'completed',
    breaks: [],
    isManuallyEdited: false,
    ...overrides,
  };
}

function brk(start: string, end: string | null): BreakRecord {
  return {
    id: `B-${start}`,
    sessionId: 'S1',
    breakStart: new Date(start),
    breakEnd: end ? new Date(end) : null,
  };
}

// ============================================================
describe('roundMinutes', () => {
  it('15分単位・切り上げ', () => {
    expect(roundMinutes(0, 15, 'up')).toBe(0);
    expect(roundMinutes(1, 15, 'up')).toBe(15);
    expect(roundMinutes(14, 15, 'up')).toBe(15);
    expect(roundMinutes(16, 15, 'up')).toBe(30);
    expect(roundMinutes(125, 15, 'up')).toBe(135);
  });

  it('ちょうど単位で割り切れる場合は増やさない', () => {
    expect(roundMinutes(15, 15, 'up')).toBe(15);
    expect(roundMinutes(30, 15, 'up')).toBe(30);
    expect(roundMinutes(180, 15, 'up')).toBe(180);
  });

  it('15分単位・切り捨て', () => {
    expect(roundMinutes(14, 15, 'down')).toBe(0);
    expect(roundMinutes(15, 15, 'down')).toBe(15);
    expect(roundMinutes(29, 15, 'down')).toBe(15);
    expect(roundMinutes(125, 15, 'down')).toBe(120);
  });

  it('浮動小数の誤差で1単位増えない', () => {
    // 187分 = 3時間7分 相当のミリ秒割り算で誤差が出るケース
    expect(roundMinutes(180.0000000001, 15, 'up')).toBe(180);
    expect(roundMinutes(179.9999999999, 15, 'down')).toBe(180);
  });

  it('不正な入力でも落ちない', () => {
    expect(roundMinutes(-5, 15, 'up')).toBe(0);
    expect(roundMinutes(NaN, 15, 'up')).toBe(0);
    expect(roundMinutes(100, 0, 'up')).toBe(100);
  });
});

// ============================================================
describe('mergeIntervals', () => {
  it('重なる区間をまとめる', () => {
    const merged = mergeIntervals([
      { start: 0, end: 100 },
      { start: 50, end: 150 },
    ]);
    expect(merged).toEqual([{ start: 0, end: 150 }]);
  });

  it('離れた区間は分けたまま', () => {
    const merged = mergeIntervals([
      { start: 0, end: 100 },
      { start: 200, end: 300 },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('長さ0の区間を除外する', () => {
    expect(mergeIntervals([{ start: 100, end: 100 }])).toEqual([]);
  });
});

// ============================================================
describe('totalBreakMs', () => {
  it('複数回の休憩を合算する', () => {
    const breaks = [
      brk('2026-08-15T03:00:00Z', '2026-08-15T03:30:00Z'),
      brk('2026-08-15T06:00:00Z', '2026-08-15T06:15:00Z'),
    ];
    expect(totalBreakMs(breaks, NOW)).toBe(45 * 60_000);
  });

  it('進行中の休憩は now までを数える', () => {
    const now = new Date('2026-08-15T03:20:00Z');
    const breaks = [brk('2026-08-15T03:00:00Z', null)];
    expect(totalBreakMs(breaks, now)).toBe(20 * 60_000);
  });

  it('重複した休憩を二重計上しない', () => {
    const breaks = [
      brk('2026-08-15T03:00:00Z', '2026-08-15T04:00:00Z'),
      brk('2026-08-15T03:30:00Z', '2026-08-15T04:30:00Z'),
    ];
    expect(totalBreakMs(breaks, NOW)).toBe(90 * 60_000);
  });
});

// ============================================================
describe('actualWorkMs', () => {
  it('休憩を引いた実労働を返す', () => {
    const s = session({
      clockIn: new Date('2026-08-15T01:00:00Z'),
      clockOut: new Date('2026-08-15T08:00:00Z'),
      breaks: [brk('2026-08-15T04:00:00Z', '2026-08-15T05:00:00Z')],
    });
    expect(actualWorkMs(s, NOW)).toBe(6 * 3600_000);
  });

  it('勤務中は now を終端にする', () => {
    const now = new Date('2026-08-15T03:00:00Z');
    const s = session({
      clockIn: new Date('2026-08-15T01:00:00Z'),
      clockOut: null,
      status: 'working',
    });
    expect(actualWorkMs(s, now)).toBe(2 * 3600_000);
  });

  it('退勤が出勤より前でも0にクランプする', () => {
    const s = session({
      clockIn: new Date('2026-08-15T08:00:00Z'),
      clockOut: new Date('2026-08-15T01:00:00Z'),
    });
    expect(actualWorkMs(s, NOW)).toBe(0);
  });

  it('休憩が勤務時間を超えても0にクランプする', () => {
    const s = session({
      clockIn: new Date('2026-08-15T01:00:00Z'),
      clockOut: new Date('2026-08-15T02:00:00Z'),
      breaks: [brk('2026-08-15T00:00:00Z', '2026-08-15T09:00:00Z')],
    });
    expect(actualWorkMs(s, NOW)).toBe(0);
  });
});

// ============================================================
describe('amountFromMinutes', () => {
  it('円未満は切り捨てる', () => {
    // 時給1250円 × 15分 = 312.5円 → 312円
    expect(amountFromMinutes(15, 1250)).toBe(312);
    // 時給1100円 × 45分 = 825円
    expect(amountFromMinutes(45, 1100)).toBe(825);
    // 時給1000円 × 150分 = 2500円
    expect(amountFromMinutes(150, 1000)).toBe(2500);
  });

  it('0分・0円は0', () => {
    expect(amountFromMinutes(0, 1000)).toBe(0);
    expect(amountFromMinutes(120, 0)).toBe(0);
  });
});

// ============================================================
describe('calcDailySalary', () => {
  const daily = (
    sessions: WorkSession[],
    settings = SETTINGS,
    wage: number | null = 1000
  ) =>
    calcDailySalary({
      workDate: '2026-08-15',
      sessions,
      hourlyWage: wage,
      settings,
      now: NOW,
    });

  // --- 保証の発動下限より下: 実時間どおり ---

  it('30分は実時間どおり500円', () => {
    const r = daily([
      session({
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T01:30:00Z'),
      }),
    ]);
    expect(r.billedMinutes).toBe(30);
    expect(r.isGuaranteeApplied).toBe(false);
    expect(r.amount).toBe(500);
  });

  it('1時間は実時間どおり1000円', () => {
    const r = daily([
      session({
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T02:00:00Z'),
      }),
    ]);
    expect(r.billedMinutes).toBe(60);
    expect(r.isGuaranteeApplied).toBe(false);
    expect(r.amount).toBe(1000);
  });

  it('下限ちょうど(1時間15分)は保証を発動させない', () => {
    const r = daily([
      session({
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T02:15:00Z'),
      }),
    ]);
    expect(r.billedMinutes).toBe(75);
    expect(r.isGuaranteeApplied).toBe(false);
    expect(r.amount).toBe(1250);
  });

  // --- 下限を超えたら保証が発動 ---

  it('下限を1分でも超えたら2時間分の2000円', () => {
    const r = daily([
      session({
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T02:16:00Z'),
      }),
    ]);
    expect(r.billedMinutes).toBe(120);
    expect(r.isGuaranteeApplied).toBe(true);
    expect(r.amount).toBe(2000);
  });

  it('1時間30分も保証で2000円', () => {
    const r = daily([
      session({
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T02:30:00Z'),
      }),
    ]);
    expect(r.billedMinutes).toBe(120);
    expect(r.isGuaranteeApplied).toBe(true);
    expect(r.amount).toBe(2000);
  });

  it('2時間ちょうども2000円（保証と同額）', () => {
    const r = daily([
      session({
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T03:00:00Z'),
      }),
    ]);
    expect(r.billedMinutes).toBe(120);
    expect(r.isGuaranteeApplied).toBe(false);
    expect(r.amount).toBe(2000);
  });

  // --- 保証を超えたら実時間 ---

  it('2時間10分は切り上げで2時間15分 = 2250円', () => {
    const r = daily([
      session({
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T03:10:00Z'),
      }),
    ]);
    expect(r.roundedMinutes).toBe(135);
    expect(r.billedMinutes).toBe(135);
    expect(r.amount).toBe(2250);
  });

  it('切り捨て設定なら2時間10分は2000円', () => {
    const r = daily(
      [
        session({
          clockIn: new Date('2026-08-15T01:00:00Z'),
          clockOut: new Date('2026-08-15T03:10:00Z'),
        }),
      ],
      { ...SETTINGS, roundingMode: 'down' }
    );
    expect(r.roundedMinutes).toBe(120);
    expect(r.amount).toBe(2000);
  });

  it('休憩を引いてから判定する', () => {
    // 3時間勤務 − 1時間休憩 = 実労働2時間
    const r = daily([
      session({
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T04:00:00Z'),
        breaks: [brk('2026-08-15T02:00:00Z', '2026-08-15T03:00:00Z')],
      }),
    ]);
    expect(r.actualWorkMs).toBe(2 * 3600_000);
    expect(r.breakMs).toBe(3600_000);
    expect(r.amount).toBe(2000);
  });

  it('最低保証は1日あたり。2回出勤しても1回だけ適用', () => {
    // 朝1時間 + 夜1時間 = 実労働2時間 → 2000円
    const r = daily([
      session({
        id: 'S1',
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T02:00:00Z'),
      }),
      session({
        id: 'S2',
        clockIn: new Date('2026-08-15T09:00:00Z'),
        clockOut: new Date('2026-08-15T10:00:00Z'),
      }),
    ]);
    expect(r.actualWorkMs).toBe(2 * 3600_000);
    expect(r.billedMinutes).toBe(120);
    expect(r.amount).toBe(2000);
  });

  it('30分ずつ2回は合算して1時間。下限以下なので1000円', () => {
    const r = daily([
      session({
        id: 'S1',
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T01:30:00Z'),
      }),
      session({
        id: 'S2',
        clockIn: new Date('2026-08-15T09:00:00Z'),
        clockOut: new Date('2026-08-15T09:30:00Z'),
      }),
    ]);
    expect(r.actualWorkMs).toBe(3600_000);
    expect(r.billedMinutes).toBe(60);
    expect(r.isGuaranteeApplied).toBe(false);
    expect(r.amount).toBe(1000);
  });

  it('保証は1日1回。朝夜1時間ずつでも4000円にはならない', () => {
    const r = daily([
      session({
        id: 'S1',
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T02:00:00Z'),
      }),
      session({
        id: 'S2',
        clockIn: new Date('2026-08-15T09:00:00Z'),
        clockOut: new Date('2026-08-15T10:30:00Z'),
      }),
    ]);
    // 合計2時間30分 → 保証(120)より長いので実時間
    expect(r.actualWorkMs).toBe(2.5 * 3600_000);
    expect(r.billedMinutes).toBe(150);
    expect(r.amount).toBe(2500);
  });

  it('勤務0分の日には保証を出さない', () => {
    const r = daily([]);
    expect(r.billedMinutes).toBe(0);
    expect(r.amount).toBe(0);
  });

  it('キャンセルされたセッションは除外する', () => {
    const r = daily([
      session({
        clockIn: new Date('2026-08-15T01:00:00Z'),
        clockOut: new Date('2026-08-15T05:00:00Z'),
        status: 'cancelled',
      }),
    ]);
    expect(r.amount).toBe(0);
  });

  it('時給未設定なら金額0（時間は計上する）', () => {
    const r = daily(
      [
        session({
          clockIn: new Date('2026-08-15T01:00:00Z'),
          clockOut: new Date('2026-08-15T05:00:00Z'),
        }),
      ],
      SETTINGS,
      null
    );
    expect(r.actualWorkMs).toBe(4 * 3600_000);
    expect(r.amount).toBe(0);
  });

  it('勤務中のセッションも now 基準で計算する', () => {
    const now = new Date('2026-08-15T04:00:00Z');
    const r = calcDailySalary({
      workDate: '2026-08-15',
      sessions: [
        session({
          clockIn: new Date('2026-08-15T01:00:00Z'),
          clockOut: null,
          status: 'working',
        }),
      ],
      hourlyWage: 1000,
      settings: SETTINGS,
      now,
    });
    expect(r.actualWorkMs).toBe(3 * 3600_000);
    expect(r.amount).toBe(3000);
  });
});

// ============================================================
describe('resolveWage', () => {
  const history: HourlyWage[] = [
    { id: 'W1', userId: 'U1', hourlyWage: 1000, effectiveFrom: '2026-01-01' },
    { id: 'W2', userId: 'U1', hourlyWage: 1100, effectiveFrom: '2026-04-01' },
  ];

  it('適用開始日ちょうどは新しい時給', () => {
    expect(resolveWage(history, '2026-04-01')).toBe(1100);
  });

  it('前日は古い時給', () => {
    expect(resolveWage(history, '2026-03-31')).toBe(1000);
  });

  it('履歴より前の日付は null', () => {
    expect(resolveWage(history, '2025-12-31')).toBeNull();
  });

  it('履歴が空なら null', () => {
    expect(resolveWage([], '2026-08-15')).toBeNull();
  });
});

// ============================================================
describe('calcMonthlySalary', () => {
  const history: HourlyWage[] = [
    { id: 'W1', userId: 'U1', hourlyWage: 1000, effectiveFrom: '2026-01-01' },
  ];

  it('work_date で当月を絞る（日またぎは開始日に計上）', () => {
    const sessions = [
      // 3/31 22:00 → 4/1 6:00 の夜勤。work_date は 3/31
      session({
        id: 'S1',
        workDate: '2026-03-31',
        clockIn: new Date('2026-03-31T13:00:00Z'),
        clockOut: new Date('2026-03-31T21:00:00Z'),
      }),
      session({
        id: 'S2',
        workDate: '2026-04-02',
        clockIn: new Date('2026-04-02T01:00:00Z'),
        clockOut: new Date('2026-04-02T05:00:00Z'),
      }),
    ];

    const march = calcMonthlySalary({
      month: '2026-03',
      sessions,
      wageHistory: history,
      settings: SETTINGS,
      now: NOW,
    });

    expect(march.days).toHaveLength(1);
    expect(march.days[0].workDate).toBe('2026-03-31');
    expect(march.totalAmount).toBe(8000);
  });

  it('日別に集計して月合計を出す', () => {
    const sessions = [
      session({
        id: 'S1',
        workDate: '2026-08-01',
        clockIn: new Date('2026-08-01T01:00:00Z'),
        clockOut: new Date('2026-08-01T05:00:00Z'),
      }),
      session({
        id: 'S2',
        workDate: '2026-08-02',
        clockIn: new Date('2026-08-02T01:00:00Z'),
        clockOut: new Date('2026-08-02T04:00:00Z'),
      }),
    ];

    const r = calcMonthlySalary({
      month: '2026-08',
      sessions,
      wageHistory: history,
      settings: SETTINGS,
      now: NOW,
    });

    expect(r.days).toHaveLength(2);
    expect(r.totalAmount).toBe(4000 + 3000);
    expect(r.totalWorkMs).toBe(7 * 3600_000);
  });

  it('時給未設定の日を報告する', () => {
    const r = calcMonthlySalary({
      month: '2025-12',
      sessions: [
        session({
          workDate: '2025-12-15',
          clockIn: new Date('2025-12-15T01:00:00Z'),
          clockOut: new Date('2025-12-15T05:00:00Z'),
        }),
      ],
      wageHistory: history,
      settings: SETTINGS,
      now: NOW,
    });

    expect(r.missingWageDates).toEqual(['2025-12-15']);
    expect(r.totalAmount).toBe(0);
  });
});

// ============================================================
describe('打刻状態', () => {
  it('セッションなしは未出勤', () => {
    const state = deriveClockState(null);
    expect(state.kind).toBe('idle');
    expect(availableActions(state)).toEqual({
      clockIn: true,
      breakStart: false,
      breakEnd: false,
      clockOut: false,
    });
  });

  it('未退勤かつ休憩なしは勤務中', () => {
    const s = session({
      clockIn: new Date('2026-08-15T01:00:00Z'),
      clockOut: null,
      status: 'working',
    });
    const state = deriveClockState(s);
    expect(state.kind).toBe('working');
    expect(availableActions(state)).toEqual({
      clockIn: false,
      breakStart: true,
      breakEnd: false,
      clockOut: true,
    });
  });

  it('未終了の休憩があれば休憩中', () => {
    const s = session({
      clockIn: new Date('2026-08-15T01:00:00Z'),
      clockOut: null,
      status: 'on_break',
      breaks: [brk('2026-08-15T02:00:00Z', null)],
    });
    const state = deriveClockState(s);
    expect(state.kind).toBe('on_break');

    const actions = availableActions(state);
    expect(actions.breakStart).toBe(false);
    expect(actions.breakEnd).toBe(true);
    // 休憩中でも退勤できる（休憩は自動で閉じる）
    expect(actions.clockOut).toBe(true);
  });

  it('退勤済みのセッションは未出勤扱い', () => {
    const s = session({
      clockIn: new Date('2026-08-15T01:00:00Z'),
      clockOut: new Date('2026-08-15T05:00:00Z'),
    });
    expect(deriveClockState(s).kind).toBe('idle');
  });
});
