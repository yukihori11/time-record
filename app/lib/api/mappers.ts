import 'server-only';

import type {
  BreakRecord,
  HourlyWage,
  PayrollSettings,
  Property,
  Reservation,
  ReservationType,
  Shift,
  WorkSession,
} from '@/app/types/domain';

// DB の行（snake_case）→ ドメイン型（camelCase）。
// この変換をサーバー側に閉じ込めることで、
// クライアントは DB のテーブル構造を知らずに済む。

/* eslint-disable @typescript-eslint/no-explicit-any */

export function toBreakRecord(row: any): BreakRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    breakStart: new Date(row.break_start),
    breakEnd: row.break_end ? new Date(row.break_end) : null,
  };
}

export function toWorkSession(row: any): WorkSession {
  const breaks = Array.isArray(row.break_records)
    ? row.break_records.map(toBreakRecord)
    : [];

  breaks.sort(
    (a: BreakRecord, b: BreakRecord) =>
      a.breakStart.getTime() - b.breakStart.getTime()
  );

  return {
    id: row.id,
    userId: row.user_id,
    propertyId: row.property_id ?? null,
    workDate: row.work_date,
    clockIn: new Date(row.clock_in),
    clockOut: row.clock_out ? new Date(row.clock_out) : null,
    status: row.status,
    note: row.note ?? null,
    breaks,
    isManuallyEdited: row.is_manually_edited ?? false,
    editedBy: row.edited_by ?? null,
    editedAt: row.edited_at ? new Date(row.edited_at) : null,
    editReason: row.edit_reason ?? null,
  };
}

export function toHourlyWage(row: any): HourlyWage {
  return {
    id: row.id,
    userId: row.user_id,
    hourlyWage: row.hourly_wage,
    effectiveFrom: row.effective_from,
    note: row.note ?? null,
  };
}

export function toSettings(row: any): PayrollSettings {
  return {
    roundingMode: row.rounding_mode,
    roundingMinutes: row.rounding_minutes,
    guaranteeThresholdMinutes: row.guarantee_threshold_minutes ?? 75,
    minGuaranteedMinutes: row.min_guaranteed_minutes,
  };
}

export function toProperty(row: any): Property {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? null,
    capacity: row.capacity ?? null,
    color: row.color,
    note: row.note ?? null,
    isActive: row.is_active,
    displayOrder: row.display_order,
  };
}

export function toReservation(row: any): Reservation {
  return {
    id: row.id,
    propertyId: row.property_id,
    typeId: row.type_id,
    guestCount: row.guest_count ?? 0,
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: row.nights ?? 0,
    status: row.status,
    note: row.note ?? null,
  };
}

export function toReservationType(row: any): ReservationType {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon ?? '',
    hasGuests: row.has_guests,
    isActive: row.is_active,
    displayOrder: row.display_order,
  };
}

export function toShift(row: any): Shift {
  return {
    id: row.id,
    userId: row.user_id,
    propertyId: row.property_id ?? null,
    reservationId: row.reservation_id ?? null,
    shiftDate: row.shift_date,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
    status: row.status,
    respondedAt: row.responded_at ? new Date(row.responded_at) : null,
    declineReason: row.decline_reason ?? null,
    note: row.note ?? null,
  };
}

/** work_sessions を取得するときの共通 select（休憩を同梱する） */
export const SESSION_SELECT = '*, break_records(*)';
