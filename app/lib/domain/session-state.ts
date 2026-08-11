import type {
  ClockActions,
  ClockState,
  WorkSession,
} from '@/app/types/domain';

/**
 * 未退勤のセッションから現在の打刻状態を判定する。
 *
 * DB の clock_out IS NULL の行が唯一の真実。
 * localStorage を使わないので、端末を変えても状態が一致する。
 */
export function deriveClockState(session: WorkSession | null): ClockState {
  if (!session || session.clockOut !== null) {
    return { kind: 'idle' };
  }

  const openBreak = session.breaks.find((b) => b.breakEnd === null);
  if (openBreak) {
    return { kind: 'on_break', session, currentBreak: openBreak };
  }

  return { kind: 'working', session };
}

/**
 * 状態ごとに押せるボタンを返す。
 *
 * UI はこの結果を見るだけにする。これにより
 * 「休憩中に休憩ボタンが押せる」といったバグが構造的に起きない。
 */
export function availableActions(state: ClockState): ClockActions {
  switch (state.kind) {
    case 'idle':
      return {
        clockIn: true,
        breakStart: false,
        breakEnd: false,
        clockOut: false,
      };
    case 'working':
      return {
        clockIn: false,
        breakStart: true,
        breakEnd: false,
        clockOut: true,
      };
    case 'on_break':
      return {
        clockIn: false,
        breakStart: false,
        // 休憩中でも退勤できる（押し忘れ防止。休憩は自動で閉じる）
        breakEnd: true,
        clockOut: true,
      };
    default: {
      // 状態を追加したらここでコンパイルエラーになる
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

export function stateLabel(state: ClockState): string {
  switch (state.kind) {
    case 'idle':
      return '未出勤';
    case 'working':
      return '勤務中';
    case 'on_break':
      return '休憩中';
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
