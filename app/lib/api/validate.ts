import 'server-only';

import { ApiError } from './errors';

// 入力検証。信頼できないリクエストボディを型付きで取り出す。

export function str(
  value: unknown,
  field: string,
  opts: { max?: number; required?: boolean } = {}
): string {
  const { max = 1000, required = true } = opts;

  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ApiError('VALIDATION_ERROR', `${field} は必須です`);
    }
    return '';
  }

  if (typeof value !== 'string') {
    throw new ApiError('VALIDATION_ERROR', `${field} は文字列で指定してください`);
  }

  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ApiError('VALIDATION_ERROR', `${field} は${max}文字以内で入力してください`);
  }

  return trimmed;
}

export function optionalStr(value: unknown, field: string, max = 1000): string | null {
  if (value === undefined || value === null || value === '') return null;
  return str(value, field, { max, required: false }) || null;
}

export function int(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number } = {}
): number {
  const { min = -Infinity, max = Infinity } = opts;

  const num = typeof value === 'string' ? Number(value) : value;

  if (typeof num !== 'number' || !Number.isFinite(num) || !Number.isInteger(num)) {
    throw new ApiError('VALIDATION_ERROR', `${field} は整数で指定してください`);
  }

  if (num < min || num > max) {
    throw new ApiError('VALIDATION_ERROR', `${field} は ${min}〜${max} の範囲で指定してください`);
  }

  return num;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dateStr(value: unknown, field: string): string {
  const s = str(value, field, { max: 10 });
  if (!DATE_RE.test(s)) {
    throw new ApiError('VALIDATION_ERROR', `${field} は YYYY-MM-DD 形式で指定してください`);
  }
  // 実在する日付か（2月30日などを弾く）
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new ApiError('VALIDATION_ERROR', `${field} が実在しない日付です`);
  }
  return s;
}

const MONTH_RE = /^\d{4}-\d{2}$/;

export function monthStr(value: unknown, field = 'month'): string {
  const s = str(value, field, { max: 7 });
  if (!MONTH_RE.test(s)) {
    throw new ApiError('VALIDATION_ERROR', `${field} は YYYY-MM 形式で指定してください`);
  }
  return s;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function optionalTime(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const s = str(value, field, { max: 8 }).slice(0, 5);
  if (!TIME_RE.test(s)) {
    throw new ApiError('VALIDATION_ERROR', `${field} は HH:MM 形式で指定してください`);
  }
  return s;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(value: unknown, field: string): string {
  const s = str(value, field, { max: 36 });
  if (!UUID_RE.test(s)) {
    throw new ApiError('VALIDATION_ERROR', `${field} の形式が不正です`);
  }
  return s;
}

export function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return uuid(value, field);
}

export function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): T {
  const s = str(value, field, { max: 50 });
  if (!allowed.includes(s as T)) {
    throw new ApiError('VALIDATION_ERROR', `${field} は ${allowed.join(' / ')} のいずれかです`);
  }
  return s as T;
}

export function isoDate(value: unknown, field: string): Date {
  const s = str(value, field, { max: 40 });
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError('VALIDATION_ERROR', `${field} の日時形式が不正です`);
  }
  return d;
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION_ERROR', 'リクエスト形式が不正です');
    }
    return body as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('VALIDATION_ERROR', 'リクエスト形式が不正です');
  }
}
