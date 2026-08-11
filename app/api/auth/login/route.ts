import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/app/lib/supabase/server';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { readBody, str } from '@/app/lib/api/validate';

// ログイン。
// セッションは httpOnly Cookie に保存されるため、
// ブラウザの JavaScript からトークンを読み取れない（XSS 耐性）。

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const email = str(body.email, 'メールアドレス', { max: 255 });
    const password = str(body.password, 'パスワード', { max: 200 });

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      // メールアドレスの存在有無を区別しない（列挙攻撃対策）
      throw new ApiError(
        'UNAUTHORIZED',
        'メールアドレスまたはパスワードが正しくありません'
      );
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id, email, name, role, is_active')
      .eq('id', data.user.id)
      .single();

    if (!profile) {
      await supabase.auth.signOut();
      throw new ApiError('UNAUTHORIZED', 'プロフィールが見つかりません');
    }

    if (!profile.is_active) {
      await supabase.auth.signOut();
      throw new ApiError('FORBIDDEN', 'このアカウントは無効化されています');
    }

    return NextResponse.json({
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name ?? '',
        role: profile.role,
        isActive: profile.is_active,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
