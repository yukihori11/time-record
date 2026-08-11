import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/app/lib/supabase/server';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { readBody, str } from '@/app/lib/api/validate';

const MIN_PASSWORD_LENGTH = 8;

/**
 * 新しいパスワードを設定する。
 *
 * メールのリンクから来た場合、クライアントで受け取った
 * アクセストークンを渡してセッションを確立してから更新する。
 * 既にログイン済みの場合はトークン不要。
 */
export const POST = withLogging('auth.reset-password.post', async (request: Request) => {
  try {
    const body = await readBody(request);
    const password = str(body.password, 'パスワード', { max: 200 });

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `パスワードは${MIN_PASSWORD_LENGTH}文字以上で設定してください`
      );
    }

    const supabase = await createServerSupabase();

    const accessToken = body.accessToken;
    const refreshToken = body.refreshToken;
    const fromResetLink = body.fromResetLink === true;

    // メールのリンクから来た場合はトークンでセッションを張る。
    //
    // トークンが無いまま既存のログインセッションに落ちると、
    // 別人のリンクを開いた際に「今ログインしている人」の
    // パスワードを変えてしまう。リンク経由と分かっている場合は
    // トークンを必須にする。
    if (fromResetLink) {
      if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
        throw new ApiError(
          'UNAUTHORIZED',
          'リンクが正しくありません。もう一度メールを送信してください'
        );
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        throw new ApiError(
          'UNAUTHORIZED',
          'リンクの有効期限が切れています。もう一度お試しください'
        );
      }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new ApiError(
        'UNAUTHORIZED',
        'リンクの有効期限が切れています。もう一度お試しください'
      );
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      throw new ApiError('VALIDATION_ERROR', error.message);
    }

    // 他の端末のセッションを無効化する。
    // 乗っ取られていた場合、攻撃者のトークンを生かしたままにしない。
    await supabase.auth.signOut({ scope: 'others' });

    return NextResponse.json({
      ok: true,
      message: 'パスワードを変更しました',
    });
  } catch (error) {
    return errorResponse(error);
  }
});
