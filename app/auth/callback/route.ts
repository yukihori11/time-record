import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/app/lib/supabase/server';
import { log } from '@/app/lib/api/logger';

/**
 * メールリンクの受け口。
 *
 * @supabase/ssr は PKCE 方式を使うため、メールのリンクは
 * ?code=... を付けて戻ってくる（トークンそのものではない）。
 * この code をサーバーで交換してセッションを確立する。
 *
 * ハッシュ（#access_token=...）で返る旧方式は
 * サーバーに届かないため、こちらの経路を正とする。
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/reset-password';
  const errorDescription = searchParams.get('error_description');

  log.info('callback.received', {
    hasCode: Boolean(code),
    next,
    hasError: Boolean(errorDescription),
  });

  if (errorDescription) {
    log.warn('callback.linkError', { reason: errorDescription });
    return NextResponse.redirect(
      `${origin}/reset-password?error_description=${encodeURIComponent(
        'リンクの有効期限が切れています。もう一度お試しください'
      )}`
    );
  }

  if (!code) {
    log.warn('callback.noCode', { query: request.nextUrl.search });
    return NextResponse.redirect(
      `${origin}/reset-password?error_description=${encodeURIComponent(
        'リンクが正しくありません。もう一度メールを送信してください'
      )}`
    );
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    log.warn('callback.exchangeFailed', { reason: error.message });
    return NextResponse.redirect(
      `${origin}/reset-password?error_description=${encodeURIComponent(
        'リンクの有効期限が切れています。もう一度お試しください'
      )}`
    );
  }

  log.info('callback.verified', { next });

  // セッションが張れた状態でパスワード設定画面へ
  return NextResponse.redirect(`${origin}${next}`);
}
