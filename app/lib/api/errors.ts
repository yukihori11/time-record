import 'server-only';

import { NextResponse } from 'next/server';
import { errorFields, log } from './logger';

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'ALREADY_CLOCKED_IN'
  | 'NOT_CLOCKED_IN'
  | 'ALREADY_ON_BREAK'
  | 'NOT_ON_BREAK'
  | 'CONFLICT'
  | 'RESERVATION_OVERLAP'
  | 'LAST_ADMIN'
  | 'INTERNAL_ERROR';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  ALREADY_CLOCKED_IN: 409,
  NOT_CLOCKED_IN: 409,
  ALREADY_ON_BREAK: 409,
  NOT_ON_BREAK: 409,
  CONFLICT: 409,
  RESERVATION_OVERLAP: 409,
  LAST_ADMIN: 409,
  INTERNAL_ERROR: 500,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHORIZED: 'ログインが必要です',
  FORBIDDEN: '権限がありません',
  NOT_FOUND: '見つかりません',
  VALIDATION_ERROR: '入力内容が正しくありません',
  ALREADY_CLOCKED_IN: '既に出勤中です',
  NOT_CLOCKED_IN: '出勤していません',
  ALREADY_ON_BREAK: '既に休憩中です',
  NOT_ON_BREAK: '休憩中ではありません',
  CONFLICT: '操作が競合しました',
  RESERVATION_OVERLAP: '同じ棟で予約期間が重複しています',
  LAST_ADMIN: '管理者が0人になるため変更できません',
  INTERNAL_ERROR: 'サーバーエラーが発生しました',
};

/** API から投げるエラー。ハンドラの catch で拾って JSON に変換する。 */
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string
  ) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = 'ApiError';
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    // 想定内のエラー。500系だけ error 扱いにする。
    const status = STATUS[error.code];
    if (status >= 500) {
      log.error('api.apiError', { code: error.code, message: error.message });
    } else {
      log.info('api.rejected', { code: error.code, message: error.message });
    }

    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status }
    );
  }

  const mapped = mapPostgresError(error);
  if (mapped) {
    // DB が弾いた。制約違反や権限エラーの原因を追えるよう詳細も残す。
    log.warn('api.dbRejected', {
      code: mapped.code,
      message: mapped.message,
      ...errorFields(error),
    });

    return NextResponse.json(
      { error: { code: mapped.code, message: mapped.message } },
      { status: STATUS[mapped.code] }
    );
  }

  // ここに来るのは想定外。必ず調査対象。
  log.error('api.unexpected', errorFields(error));

  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: DEFAULT_MESSAGE.INTERNAL_ERROR,
      },
    },
    { status: 500 }
  );
}

/**
 * Postgres / PostgREST のエラーをアプリのエラーコードに変換する。
 *
 * RPC が RAISE EXCEPTION した場合、メッセージの先頭に
 * 'ALREADY_CLOCKED_IN: ...' のようなコードが入る規約にしている。
 */
export function mapPostgresError(
  error: unknown
): { code: ErrorCode; message: string } | null {
  if (!error || typeof error !== 'object') return null;

  const e = error as { code?: string; message?: string; details?: string };
  const message = e.message ?? '';

  const knownCodes: ErrorCode[] = [
    'ALREADY_CLOCKED_IN',
    'NOT_CLOCKED_IN',
    'ALREADY_ON_BREAK',
    'NOT_ON_BREAK',
    'RESERVATION_OVERLAP',
    'LAST_ADMIN',
    'FORBIDDEN',
    'NOT_FOUND',
  ];

  for (const code of knownCodes) {
    if (message.includes(code)) {
      const detail = message.split(':').slice(1).join(':').trim();
      return { code, message: detail || DEFAULT_MESSAGE[code] };
    }
  }

  // DB 側が投げる VALIDATION は、そのまま見せてよい文言にしてある。
  // 例:「すでに同じ内容で回答しています」「過ぎたシフトは変更できません」
  // 拾わないと共通の「入力内容が正しくありません」になり、
  // 何が起きたのか本人に伝わらない。
  if (message.includes('VALIDATION:')) {
    const detail = message.split('VALIDATION:').slice(1).join(':').trim();
    return {
      code: 'VALIDATION_ERROR',
      message: detail || DEFAULT_MESSAGE.VALIDATION_ERROR,
    };
  }

  if (message.includes('BREAK_OVERLAP')) {
    return { code: 'CONFLICT', message: '休憩時間が重複しています' };
  }
  if (message.includes('INVALID_BREAK')) {
    const detail = message.split(':').slice(1).join(':').trim();
    return { code: 'VALIDATION_ERROR', message: detail || '休憩時間が不正です' };
  }

  switch (e.code) {
    case '23505': // unique_violation
      if (message.includes('uniq_open_session')) {
        return { code: 'ALREADY_CLOCKED_IN', message: DEFAULT_MESSAGE.ALREADY_CLOCKED_IN };
      }
      if (message.includes('uniq_open_break')) {
        return { code: 'ALREADY_ON_BREAK', message: DEFAULT_MESSAGE.ALREADY_ON_BREAK };
      }
      if (message.includes('hourly_wages_unique_from')) {
        return { code: 'CONFLICT', message: 'その日付の時給は既に登録されています' };
      }
      if (message.includes('uniq_shift_assignment')) {
        return { code: 'CONFLICT', message: '同じ日時のシフトが既に割り当てられています' };
      }
      return { code: 'CONFLICT', message: '既に登録されています' };

    case '23503': // foreign_key_violation
      return { code: 'VALIDATION_ERROR', message: '参照先のデータが存在しません' };

    case '23514': // check_violation
      return { code: 'VALIDATION_ERROR', message: '入力値が制約に違反しています' };

    case '42501': // insufficient_privilege
      return { code: 'FORBIDDEN', message: DEFAULT_MESSAGE.FORBIDDEN };

    case 'P0002': // no_data_found
    case 'PGRST116': // 0 rows
      return { code: 'NOT_FOUND', message: DEFAULT_MESSAGE.NOT_FOUND };

    default:
      return null;
  }
}
