import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { createAdminSupabase } from '@/app/lib/supabase/server';
import { optionalStr, readBody, str } from '@/app/lib/api/validate';

/**
 * バイト生を追加する。
 *
 * 招待メールを送り、本人にパスワードを設定してもらう。
 * こちらでパスワードを決めて伝える必要がない。
 *
 * ユーザー作成は Auth の管理APIが必要なため、
 * ここだけ service_role キーを使う。
 */
export async function POST(request: Request) {
  try {
    // 呼び出し元が管理者であることを先に確認する
    await requireAdmin();

    const body = await readBody(request);
    const email = str(body.email, 'メールアドレス', { max: 255 }).toLowerCase();
    const name = optionalStr(body.name, '氏名', 100) ?? '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError('VALIDATION_ERROR', 'メールアドレスの形式が正しくありません');
    }

    let admin;
    try {
      admin = createAdminSupabase();
    } catch {
      throw new ApiError(
        'INTERNAL_ERROR',
        'スタッフの追加には SUPABASE_SERVICE_ROLE_KEY の設定が必要です'
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo: `${siteUrl}/reset-password`,
    });

    if (error) {
      // 既に登録済みのメールアドレス
      if (
        error.message.includes('already been registered') ||
        error.message.includes('already exists')
      ) {
        throw new ApiError(
          'CONFLICT',
          'このメールアドレスは既に登録されています'
        );
      }
      throw new ApiError('VALIDATION_ERROR', error.message);
    }

    // トリガーで users 行が作られるが、氏名を確実に入れておく
    if (data.user && name) {
      await admin.from('users').update({ name }).eq('id', data.user.id);
    }

    return NextResponse.json(
      {
        ok: true,
        message: `${email} に招待メールを送信しました`,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
