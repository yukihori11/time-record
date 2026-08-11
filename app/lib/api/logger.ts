import 'server-only';

import { redact } from '@/app/lib/domain/redact';

/**
 * API のログ。
 *
 * Vercel のログは1行1レコードで扱われるため、JSON で出す。
 * ダッシュボードから検索・絞り込みができるようにするのが目的。
 *
 * 出力例:
 *   {"lv":"info","ev":"api.ok","method":"POST","path":"/api/clock/punch",
 *    "status":200,"ms":142,"reqId":"a1b2c3","userId":"...","action":"clock_in"}
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

function write(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    lv: level,
    ev: event,
    t: new Date().toISOString(),
    ...(redact(fields) as LogFields),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: LogFields) => {
    // 開発中だけ出す。本番で埋もれるのを防ぐ。
    if (process.env.NODE_ENV !== 'production') write('debug', event, fields);
  },
  info: (event: string, fields?: LogFields) => write('info', event, fields),
  warn: (event: string, fields?: LogFields) => write('warn', event, fields),
  error: (event: string, fields?: LogFields) => write('error', event, fields),
};

/** エラーをログに出せる形に変換する */
export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errName: error.name,
      errMsg: error.message,
      // スタックは長いので先頭のみ
      stack: error.stack?.split('\n').slice(0, 4).join(' | '),
      // Supabase のエラーは code / details を持つ
      ...(('code' in error) ? { pgCode: (error as { code: unknown }).code } : {}),
      ...(('details' in error)
        ? { details: (error as { details: unknown }).details }
        : {}),
      ...(('hint' in error) ? { hint: (error as { hint: unknown }).hint } : {}),
    };
  }
  return { err: String(error) };
}

/** リクエストごとの識別子。1リクエストの流れを追うために使う */
export function requestId(): string {
  return Math.random().toString(36).slice(2, 10);
}
