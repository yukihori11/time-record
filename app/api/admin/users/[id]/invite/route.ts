import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { createAdminSupabase } from '@/app/lib/supabase/server';
import { uuid } from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

/** 招待メールを再送する */
export const POST = withLogging('admin.users.id.invite.post', async (_request: Request, { params }: Params) => {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;
    const userId = uuid(id, 'id');

    const { data: target } = await supabase
      .from('users')
      .select('email, activated_at')
      .eq('id', userId)
      .maybeSingle();

    if (!target) throw new ApiError('NOT_FOUND');

    if (target.activated_at) {
      throw new ApiError(
        'CONFLICT',
        'このスタッフは既に利用を開始しています'
      );
    }

    let admin;
    try {
      admin = createAdminSupabase();
    } catch {
      throw new ApiError(
        'INTERNAL_ERROR',
        '再送には SUPABASE_SERVICE_ROLE_KEY の設定が必要です'
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

    const { error } = await admin.auth.admin.inviteUserByEmail(target.email, {
      // サーバーでトークンを検証してからパスワード設定画面へ送る
      redirectTo: `${siteUrl}/auth/confirm?next=/reset-password`,
    });

    if (error) {
      throw new ApiError('VALIDATION_ERROR', error.message);
    }

    await admin
      .from('users')
      .update({ invited_at: new Date().toISOString() })
      .eq('id', userId);

    return NextResponse.json({
      ok: true,
      message: `${target.email} に招待メールを再送しました`,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * 招待の取り消し。
 *
 * まだ利用を開始していない人だけ削除できる。
 * 勤務記録がある人を誤って消さないよう、DB側でも検査する。
 */
export const DELETE = withLogging('admin.users.id.invite.delete', async (_request: Request, { params }: Params) => {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;
    const userId = uuid(id, 'id');

    // 条件の確認は RPC 側で行う（利用開始済み・勤務記録ありを弾く）
    const { error: rpcError } = await supabase.rpc('admin_cancel_invite', {
      target_user_id: userId,
    });

    if (rpcError) throw rpcError;

    // 認証ユーザーも消す。残すと同じメールで再招待できなくなる。
    try {
      const admin = createAdminSupabase();
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // service_role が無い場合、public.users だけ消えた状態になる。
      // 再招待はできないが、一覧からは消えるので実害は小さい。
      console.warn('[invite] 認証ユーザーの削除をスキップしました');
    }

    return NextResponse.json({ ok: true, message: '招待を取り消しました' });
  } catch (error) {
    return errorResponse(error);
  }
});
