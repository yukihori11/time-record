/**
 * エラーをログに出せる形に変換する。
 *
 * Supabase / PostgREST のエラーは Error を継承していない
 * ただのオブジェクトで返る。String() すると [object Object] に
 * なって原因が追えなくなるため、プロパティを個別に拾う。
 *
 * サーバー専用モジュールから切り出しているのは、
 * この変換をテストで検証できるようにするため。
 */

export interface ErrorFields {
  [key: string]: unknown;
}

export function toErrorFields(error: unknown): ErrorFields {
  if (error === null || error === undefined) {
    return { err: String(error) };
  }

  const fields: ErrorFields = {};

  if (error instanceof Error) {
    fields.errName = error.name;
    fields.errMsg = error.message;
    // スタックは長いので先頭のみ
    fields.stack = error.stack?.split('\n').slice(0, 4).join(' | ');
  }

  if (typeof error === 'object') {
    const e = error as Record<string, unknown>;

    // Supabase は message / code / details / hint を持つ
    if (typeof e.message === 'string' && !fields.errMsg) {
      fields.errMsg = e.message;
    }
    if (e.code !== undefined) fields.pgCode = e.code;
    if (e.details !== undefined && e.details !== null) fields.details = e.details;
    if (e.hint !== undefined && e.hint !== null) fields.hint = e.hint;
    if (e.status !== undefined) fields.httpStatus = e.status;
    if (e.statusCode !== undefined) fields.httpStatus = e.statusCode;

    // 上のどれにも当たらないと中身が分からないままになる。
    // 全体を残して調査できるようにする（伏字は出力側が処理する）。
    if (!fields.errMsg && fields.pgCode === undefined) {
      try {
        fields.raw = JSON.parse(JSON.stringify(error));
      } catch {
        fields.raw = Object.keys(e).join(',');
      }
    }

    return fields;
  }

  if (!fields.errMsg) fields.err = String(error);
  return fields;
}
