import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { createAdminSupabase } from '@/app/lib/supabase/server';
import { uuid } from '@/app/lib/api/validate';
import { log } from '@/app/lib/api/logger';

/** 伝えやすさを優先し、見間違えやすい文字を除く */
const CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(length = 10): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('');
}

type Params = { params: Promise<{ id: string }> };

/**
 * パスワードを再発行する。
 *
 * 本人がメールを受け取れない場合の手段。
 * メールが使えるなら /forgot-password から本人が再設定できるので、
 * こちらは管理者が直接伝える運用のための逃げ道。
 *
 * 発行したパスワードは応答に含めるが、DBには平文で残さない。
 * この画面を閉じたら二度と見られない。
 */
export const POST = withLogging(
  'admin.users.password.post',
  async (_request: Request, { params }: Params) => {
    try {
      const { profile: actor } = await requireAdmin();
      const { id } = await params;
      const userId = uuid(id, 'id');

      let admin;
      try {
        admin = createAdminSupabase();
      } catch {
        throw new ApiError(
          'INTERNAL_ERROR',
          'パスワードの再発行には SUPABASE_SERVICE_ROLE_KEY が必要です'
        );
      }

      const { data: target } = await admin
        .from('users')
        .select('email, name')
        .eq('id', userId)
        .maybeSingle();

      if (!target) throw new ApiError('NOT_FOUND');

      const password = generatePassword();

      // 誰が誰のパスワードを変えたかは監査上必ず残す。
      // パスワード自体はロガーが伏字にする。
      log.warn('user.passwordReset', {
        actorId: actor.id,
        actorName: actor.name,
        targetId: userId,
        targetEmail: target.email,
      });

      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
      });

      if (error) {
        log.error('user.passwordResetFailed', {
          targetId: userId,
          reason: error.message,
        });
        throw new ApiError('INTERNAL_ERROR', error.message);
      }

      return NextResponse.json({
        ok: true,
        email: target.email,
        password,
      });
    } catch (error) {
      return errorResponse(error);
    }
  }
);
