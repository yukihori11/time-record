import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerSupabase } from '@/app/lib/supabase/server';
import { log } from '@/app/lib/api/logger';

/**
 * メールリンクの受け口。
 *
 * Supabase のメールは token_hash をクエリで渡してくる。
 * それをサーバーで検証してセッションを張り、
 * パスワード設定画面へ送る。
 *
 * クライアント側の JavaScript を待たずに処理できるため、
 * 「リンクを踏んだのにログイン画面に戻される」ことがない。
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/reset-password';

  log.info('confirm.received', {
    hasToken: Boolean(tokenHash),
    type,
    next,
  });

  if (!tokenHash || !type) {
    log.warn('confirm.missingToken', { url: request.nextUrl.search });
    return NextResponse.redirect(
      `${origin}/reset-password?error_description=${encodeURIComponent(
        'リンクが正しくありません'
      )}`
    );
  }

  const supabase = await createServerSupabase();

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    log.warn('confirm.verifyFailed', { type, reason: error.message });
    return NextResponse.redirect(
      `${origin}/reset-password?error_description=${encodeURIComponent(
        'リンクの有効期限が切れています。もう一度招待を送ってもらってください'
      )}`
    );
  }

  log.info('confirm.verified', { type, next });

  // セッションが張れた状態でパスワード設定画面へ
  return NextResponse.redirect(`${origin}${next}`);
}
