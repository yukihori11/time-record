import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/app/lib/supabase/server';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { enumValue, readBody, str } from '@/app/lib/api/validate';

/**
 * 招待・パスワードリセットのリンクを検証してセッションを張る。
 *
 * Supabase のメールリンクは token_hash をクエリで渡してくる。
 * これを verifyOtp に通すと Cookie にセッションが入り、
 * その後 updateUser でパスワードを設定できるようになる。
 *
 * 古い形式（URLのハッシュに access_token）は
 * reset-password 側で setSession を使うため、ここは通らない。
 */
export async function POST(request: Request) {
  try {
    const body = await readBody(request);

    const tokenHash = str(body.tokenHash, 'トークン', { max: 500 });
    const type = enumValue(body.type ?? 'invite', 'type', [
      'invite',
      'recovery',
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
      throw new ApiError(
        'UNAUTHORIZED',
        'リンクの有効期限が切れています。管理者にもう一度招待を送ってもらってください'
      );
    }

    return NextResponse.json({
      ok: true,
      email: data.user.email ?? '',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
