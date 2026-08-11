import { describe, expect, it } from 'vitest';
import { toErrorFields } from './error-fields';

describe('エラーのログ変換', () => {
  it('Supabase のエラーから中身を取り出す', () => {
    // 実際に返ってきた形（Error を継承していない）
    const supabaseError = {
      code: 'P0002',
      details: null,
      hint: null,
      message: 'NOT_FOUND: 予定が見つかりません',
    };

    const fields = toErrorFields(supabaseError);

    expect(fields.errMsg).toBe('NOT_FOUND: 予定が見つかりません');
    expect(fields.pgCode).toBe('P0002');
    // これが [object Object] になると原因が追えない
    expect(fields.raw).toBeUndefined();
  });

  it('制約違反のエラーも読める', () => {
    const fields = toErrorFields({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: 'Key (user_id)=(...) already exists.',
    });

    expect(fields.pgCode).toBe('23505');
    expect(fields.details).toContain('already exists');
  });

  it('通常の Error はスタックまで残す', () => {
    const fields = toErrorFields(new TypeError('壊れています'));

    expect(fields.errName).toBe('TypeError');
    expect(fields.errMsg).toBe('壊れています');
    expect(typeof fields.stack).toBe('string');
  });

  it('中身の分からないオブジェクトも捨てない', () => {
    const fields = toErrorFields({ weird: true, nested: { a: 1 } });

    // message も code も無い場合は全体を残す
    expect(fields.raw).toEqual({ weird: true, nested: { a: 1 } });
  });

  it('文字列で投げられた場合', () => {
    expect(toErrorFields('何か失敗')).toEqual({ err: '何か失敗' });
  });

  it('null と undefined で落ちない', () => {
    expect(toErrorFields(null)).toEqual({ err: 'null' });
    expect(toErrorFields(undefined)).toEqual({ err: 'undefined' });
  });

  it('循環参照があっても落ちない', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    const fields = toErrorFields(circular);
    // JSON にできないのでキー名だけ残す
    expect(fields.raw).toBe('a,self');
  });

  it('HTTPステータスを持つエラー（プッシュ通知など）', () => {
    expect(toErrorFields({ statusCode: 410, message: 'Gone' })).toMatchObject({
      httpStatus: 410,
      errMsg: 'Gone',
    });
  });

  it('null の details や hint は出さない', () => {
    const fields = toErrorFields({
      code: 'P0002',
      message: 'x',
      details: null,
      hint: null,
    });

    expect('details' in fields).toBe(false);
    expect('hint' in fields).toBe(false);
  });
});
