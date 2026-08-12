import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { readBody, str } from '@/app/lib/api/validate';
import { log } from '@/app/lib/api/logger';

const MIN_LENGTH = 8;

/**
 * 自分のパスワードを変更する。
 *
 * ログイン済みであることが前提。メールは使わない。
 *
 * パスワードを忘れてログインできない場合は、
 * 管理者が設定画面から再発行する
 * （/api/admin/users/[id]/password）。
 */
export const POST = withLogging('me.password.post', async (request: Request) => {
  try {
    const { supabase, profile } = await requireUser();
    const body = await readBody(request);

    const password = str(body.password, 'パスワード', { max: 200 });

    if (password.length < MIN_LENGTH) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `パスワードは${MIN_LENGTH}文字以上で設定してください`
      );
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      log.warn('me.passwordFailed', {
        userId: profile.id,
        reason: error.message,
      });
      throw new ApiError('VALIDATION_ERROR', error.message);
    }

    log.info('me.passwordChanged', { userId: profile.id });

    // 他の端末のセッションを無効化する。
    // 乗っ取られていた場合に、攻撃者のトークンを生かしたままにしない。
    await supabase.auth.signOut({ scope: 'others' });

    return NextResponse.json({
      ok: true,
      message: 'パスワードを変更しました',
    });
  } catch (error) {
    return errorResponse(error);
  }
});
