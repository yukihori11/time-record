import 'server-only';

import { NextResponse } from 'next/server';
import { errorResponse } from './errors';
import { errorFields, log, requestId } from './logger';

/**
 * API ハンドラを包んで、入口と出口を必ずログに残す。
 *
 * 各ルートで console.log を書くと、書き忘れが起きるうえ
 * 形式もばらつく。ここで一括して面倒を見る。
 *
 * 記録するもの:
 *   - リクエストの受付（メソッド・パス・クエリ）
 *   - 応答（ステータス・所要時間）
 *   - エラー（種別・メッセージ・Postgres のコード）
 *
 * リクエストIDを振るので、1つの操作で出た複数行を
 * 後から突き合わせられる。
 */

export interface HandlerContext {
  /** このリクエストの識別子。個別のログに添えると追跡できる */
  reqId: string;
  /** ハンドラ内から任意の情報をログに足す */
  addFields: (fields: Record<string, unknown>) => void;
}

type Handler<T> = (
  request: Request,
  routeContext: T,
  ctx: HandlerContext
) => Promise<NextResponse>;

export function withLogging<T = unknown>(
  name: string,
  handler: Handler<T>
): (request: Request, routeContext: T) => Promise<NextResponse> {
  return async (request: Request, routeContext: T) => {
    const reqId = requestId();
    const started = Date.now();

    const url = new URL(request.url);
    const extra: Record<string, unknown> = {};

    const base = {
      reqId,
      method: request.method,
      path: url.pathname,
      ...(url.search ? { query: url.search.slice(0, 200) } : {}),
    };

    log.info(`${name}.start`, base);

    try {
      const response = await handler(request, routeContext, {
        reqId,
        addFields: (fields) => Object.assign(extra, fields),
      });

      const ms = Date.now() - started;
      const status = response.status;

      // 遅いリクエストは目立たせる。1秒を超えたら調査対象。
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      const event =
        status >= 400 ? `${name}.fail` : ms > 1000 ? `${name}.slow` : `${name}.ok`;

      log[level](event, { ...base, ...extra, status, ms });

      // 応答にIDを載せる。画面のエラーからログを引けるようにする。
      response.headers.set('X-Request-Id', reqId);
      return response;
    } catch (error) {
      const ms = Date.now() - started;

      // ここに来るのは想定外の例外。ApiError は errorResponse が処理する。
      log.error(`${name}.error`, {
        ...base,
        ...extra,
        ms,
        ...errorFields(error),
      });

      const response = errorResponse(error);
      response.headers.set('X-Request-Id', reqId);
      return response;
    }
  };
}
