import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/app/lib/supabase/server';
import { errorResponse } from '@/app/lib/api/errors';
import { readBody, str } from '@/app/lib/api/validate';

// パスワードリセットのメールを送る。
//
// 登録の有無にかかわらず同じレスポンスを返す。
// 「このメールは登録されていません」と返すと、
// 攻撃者に有効なメールアドレスを教えることになるため。

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const email = str(body.email, 'メールアドレス', { max: 255 });

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // サーバーでトークンを検証してからパスワード設定画面へ送る
      redirectTo: `${siteUrl}/auth/confirm?next=/reset-password`,
    });

    if (error) {
      // 送信失敗もログに残すだけでクライアントには成功を返す
      console.error('[auth] パスワードリセット送信失敗:', error.message);
    }

    return NextResponse.json({
      ok: true,
      message:
        'パスワード再設定用のメールを送信しました。メールをご確認ください。',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
