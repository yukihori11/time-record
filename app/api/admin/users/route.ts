import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { createAdminSupabase } from '@/app/lib/supabase/server';
import { enumValue, optionalStr, readBody, str } from '@/app/lib/api/validate';

/**
 * バイト生を追加する。
 *
 * 招待メールを送り、本人にパスワードを設定してもらう。
 * こちらでパスワードを決めて伝える必要がない。
 *
 * ユーザー作成は Auth の管理APIが必要なため、
 * ここだけ service_role キーを使う。
 */
export async function POST(request: Request) {
  try {
    // 呼び出し元が管理者であることを先に確認する
    await requireAdmin();

    const body = await readBody(request);
    const email = str(body.email, 'メールアドレス', { max: 255 }).toLowerCase();
    const name = optionalStr(body.name, '氏名', 100) ?? '';
    const role = enumValue(body.role ?? 'staff', '権限', [
      'staff',
      'admin',
    ] as const);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError('VALIDATION_ERROR', 'メールアドレスの形式が正しくありません');
    }

    let admin;
    try {
      admin = createAdminSupabase();
    } catch {
      throw new ApiError(
        'INTERNAL_ERROR',
        'スタッフの追加には SUPABASE_SERVICE_ROLE_KEY の設定が必要です'
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo: `${siteUrl}/reset-password`,
    });

    if (error) {
      // 既に登録済みのメールアドレス
      if (
        error.message.includes('already been registered') ||
        error.message.includes('already exists')
      ) {
        throw new ApiError(
          'CONFLICT',
          'このメールアドレスは既に登録されています'
        );
      }
      throw new ApiError('VALIDATION_ERROR', error.message);
    }

    // 氏名と権限を設定する。
    //
    // role をここで直接書けるのは service_role キーだから。
    // 招待された本人はまだログインしておらず RPC を通せないため、
    // この経路に限って直接更新する。
    // 呼び出し元が管理者であることは requireAdmin で確認済み。
    //
    // upsert にしているのは、auth.users のトリガーによる
    // public.users の作成が万一走らなかった場合に備えるため。
    // UPDATE だけだと対象0件でも成功扱いになり、権限が
    // 既定の staff のまま気づかず残ってしまう。
    if (data.user) {
      const base = { id: data.user.id, email, name, role };

      // invited_at / activated_at はマイグレーション 0020 の列。
      // 未適用の環境では列なしで書き込む（招待の区別ができないだけ）。
      let profileError = (
        await admin.from('users').upsert(
          {
            ...base,
            invited_at: new Date().toISOString(),
            // 本人が初めてログインするまでは「招待中」。
            // トリガー(handle_user_signin)が activated_at を埋める。
            activated_at: null,
          },
          { onConflict: 'id' }
        )
      ).error;

      if (profileError?.message.includes('invited_at')) {
        profileError = (
          await admin.from('users').upsert(base, { onConflict: 'id' })
        ).error;
      }

      if (profileError) {
        // 認証ユーザーだけ残ると次回の招待が
        // 「既に登録済み」で弾かれ、復旧できなくなる
        await admin.auth.admin.deleteUser(data.user.id);
        throw new ApiError(
          'INTERNAL_ERROR',
          `プロフィールの作成に失敗しました: ${profileError.message}`
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        message: `${email} に招待メールを送信しました（${
          role === 'admin' ? '管理者' : 'バイト生'
        }）`,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
