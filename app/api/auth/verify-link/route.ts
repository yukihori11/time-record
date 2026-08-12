import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/app/lib/supabase/server';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { enumValue, readBody, str } from '@/app/lib/api/validate';
import { log } from '@/app/lib/api/logger';

/**
 * メールリンクのトークンを検証してセッションを張る。
 *
 * Supabase のリンクは token_hash をクエリで渡してくる。
 * これを verifyOtp に通すと Cookie にセッションが入り、
 * その後パスワードを設定できるようになる。
 *
 * PKCE 方式（?code=）はブラウザ側の code_verifier が必要で、
 * メールを別の端末で開くと交換できない。そのため
 * メールの送信側では implicit 方式を使い、この経路で受ける。
 */
export const POST = withLogging(
  'auth.verify-link.post',
  async (request: Request) => {
    try {
      const body = await readBody(request);

      const tokenHash = str(body.tokenHash, 'トークン', { max: 500 });
      const type = enumValue(body.type ?? 'recovery', 'type', [
        'recovery',
        'invite',
        'signup',
        'magiclink',
        'email',
      ] as const);

      const supabase = await createServerSupabase();

      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (error || !data.user) {
        log.warn('verifyLink.failed', { type, reason: error?.message });
        throw new ApiError(
          'UNAUTHORIZED',
          'リンクの有効期限が切れています。もう一度メールを送信してください'
        );
      }

      log.info('verifyLink.verified', { type, userId: data.user.id });

      return NextResponse.json({ ok: true, email: data.user.email ?? '' });
    } catch (error) {
      return errorResponse(error);
    }
  }
);
