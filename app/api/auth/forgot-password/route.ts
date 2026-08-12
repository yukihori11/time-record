import { NextResponse } from 'next/server';
import {
  createAdminSupabase,
  createMailSupabase,
} from '@/app/lib/supabase/server';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { readBody, str } from '@/app/lib/api/validate';
import { log } from '@/app/lib/api/logger';

/**
 * パスワード再設定のメールを送る。
 *
 * 登録済みのアドレスにのみ送る。
 * Supabase の resetPasswordForEmail は、設定によっては
 * 未登録のアドレスにもサインアップ確認メールを送ってしまうため、
 * 先に登録の有無を確認する。
 *
 * ただし応答は登録の有無で変えない。
 * 「このメールは登録されていません」と返すと、
 * 攻撃者に有効なアドレスを教えることになるため。
 */
export const POST = withLogging(
  'auth.forgot-password.post',
  async (request: Request) => {
    try {
      const body = await readBody(request);
      const email = str(body.email, 'メールアドレス', { max: 255 })
        .toLowerCase()
        .trim();

      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

      // 利用者に返す文言は常に同じ
      const sameResponse = NextResponse.json({
        ok: true,
        message:
          '登録されているメールアドレスであれば、再設定用のメールを送信しました。',
      });

      let admin;
      try {
        admin = createAdminSupabase();
      } catch {
        log.error('forgotPassword.noServiceKey', {
          message: 'SUPABASE_SERVICE_ROLE_KEY が未設定のため送信できません',
        });
        return sameResponse;
      }

      // 登録済みか確認する。未登録なら何も送らない。
      const { data: user } = await admin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (!user) {
        log.info('forgotPassword.unknownEmail', { email });
        return sameResponse;
      }

      // 再設定のメールを送る。
      //
      // implicit 方式のクライアントを使う。
      // 既定の PKCE はリンクを開いた端末に code_verifier が
      // 必要で、メールから開くと「リンク切れ」になる。
      const supabase = createMailSupabase();

      const { error: sendError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${siteUrl}/reset-password` }
      );

      if (sendError) {
        log.error('forgotPassword.sendFailed', { reason: sendError.message });
        return sameResponse;
      }

      log.info('forgotPassword.sent', { email });
      return sameResponse;
    } catch (error) {
      return errorResponse(error);
    }
  }
);
