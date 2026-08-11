// アプリ内部で使うドメイン型。
// DB の行型（snake_case）はサーバー側に閉じ込め、こちらは camelCase。
//
// 日付は Date ではなく 'YYYY-MM-DD' 文字列で持つ。
// Date にするとタイムゾーンで1日ズレる事故が起きるため。

export type Role = 'admin' | 'staff';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
}

export interface HourlyWage {
  id: string;
  userId: string;
  hourlyWage: number;
  effectiveFrom: string; // YYYY-MM-DD
  note?: string | null;
}

export interface BreakRecord {
  id: string;
  sessionId: string;
  breakStart: Date;
  breakEnd: Date | null; // null = 休憩中
}

export type SessionStatus = 'working' | 'on_break' | 'completed' | 'cancelled';

export interface WorkSession {
  id: string;
  userId: string;
  propertyId: string | null;
  workDate: string; // YYYY-MM-DD（夜勤の日またぎは開始日）
  clockIn: Date;
  clockOut: Date | null; // null = 勤務中
  status: SessionStatus;
  note?: string | null;
  breaks: BreakRecord[];
  isManuallyEdited: boolean;
  editedBy?: string | null;
  editedAt?: Date | null;
  editReason?: string | null;
}

export type RoundingMode = 'up' | 'down';

export interface PayrollSettings {
  roundingMode: RoundingMode;
  roundingMinutes: number;
  minGuaranteedMinutes: number;
}

export interface Property {
  id: string;
  name: string;
  address?: string | null;
  capacity?: number | null;
  color: string;
  note?: string | null;
  isActive: boolean;
  displayOrder: number;
}

export interface Reservation {
  id: string;
  propertyId: string;
  guestName: string;
  guestCount: number;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  checkInTime?: string | null;
  checkOutTime?: string | null;
  nights: number;
  status: 'confirmed' | 'cancelled';
  source?: string | null;
  contact?: string | null;
  note?: string | null;
}

export type ShiftStatus = 'assigned' | 'accepted' | 'declined';

export interface Shift {
  id: string;
  userId: string;
  propertyId: string | null;
  shiftDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  endTime: string | null;
  status: ShiftStatus;
  respondedAt: Date | null;
  declineReason?: string | null;
  note?: string | null;
}

// ------------------------------------------------------------
// 打刻状態
//
// 判別可能ユニオンにすることで、4つのボタンの活性/非活性が
// switch で網羅的に決まる。「休憩中に休憩ボタンが押せる」という
// バグが型レベルで潰れる。
// ------------------------------------------------------------
export type ClockState =
  | { kind: 'idle' }
  | { kind: 'working'; session: WorkSession }
  | { kind: 'on_break'; session: WorkSession; currentBreak: BreakRecord };

export interface ClockActions {
  clockIn: boolean;
  breakStart: boolean;
  breakEnd: boolean;
  clockOut: boolean;
}

// 1日分の給与計算結果
export interface DailySalary {
  workDate: string;
  sessionIds: string[];
  actualWorkMs: number;
  actualWorkMinutes: number;
  roundedMinutes: number;
  billedMinutes: number;
  isGuaranteeApplied: boolean;
  breakMs: number;
  hourlyWage: number | null;
  amount: number;
}

export interface MonthlySalary {
  month: string; // YYYY-MM
  days: DailySalary[];
  totalAmount: number;
  totalWorkMs: number;
  totalBreakMs: number;
  totalBilledMinutes: number;
  missingWageDates: string[]; // 時給未設定の日
}
