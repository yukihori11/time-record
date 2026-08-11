import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { ApiError, errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { createAdminSupabase } from '@/app/lib/supabase/server';
import { enumValue, optionalStr, readBody, str } from '@/app/lib/api/validate';
import { log } from '@/app/lib/api/logger';

const MIN_PASSWORD_LENGTH = 8;

/**
 * スタッフを追加する。
 *
 * 管理者がパスワードまで決めて作成し、本人には
 * 口頭や LINE で直接伝える。
 *
 * 招待メール方式をやめた理由:
 *   Supabase の招待リンクはトークンを URL のハッシュに付けるため
 *   サーバーで受け取れず、本人がパスワードを設定できなかった。
 *   管理者が直接伝える方が確実で、やり直しもすぐできる。
 *
 * パスワードを忘れた場合はメールで再設定できる（/forgot-password）。
 */
export const POST = withLogging('admin.users.post', async (request: Request) => {
  try {
    const { profile: actor } = await requireAdmin();

    const body = await readBody(request);
    const email = str(body.email, 'メールアドレス', { max: 255 }).toLowerCase();
    const name = optionalStr(body.name, '氏名', 100) ?? '';
    const password = str(body.password, 'パスワード', { max: 200 });
    const role = enumValue(body.role ?? 'staff', '権限', [
      'staff',
      'admin',
    ] as const);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'メールアドレスの形式が正しくありません'
      );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`
      );
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

    log.info('user.create', { email, role, actorId: actor.id });

    // email_confirm を立てて、確認メールなしですぐ使えるようにする
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (error) {
      if (
        error.message.includes('already been registered') ||
        error.message.includes('already exists')
      ) {
        throw new ApiError(
          'CONFLICT',
          'このメールアドレスは既に登録されています'
        );
      }
      log.error('user.createFailed', { email, reason: error.message });
      throw new ApiError('VALIDATION_ERROR', error.message);
    }

    if (!data.user) {
      throw new ApiError('INTERNAL_ERROR', 'ユーザーの作成に失敗しました');
    }

    // 氏名と権限を設定する。
    //
    // role をここで直接書けるのは service_role キーだから。
    // 呼び出し元が管理者であることは requireAdmin で確認済み。
    //
    // upsert にしているのは、auth.users のトリガーによる
    // public.users の作成が万一走らなかった場合に備えるため。
    const base = { id: data.user.id, email, name, role };

    let profileError = (
      await admin.from('users').upsert(
        {
          ...base,
          // 管理者が直接作成したので、最初から利用可能な状態
          activated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
    ).error;

    // activated_at はマイグレーション 0020 の列。未適用でも動くようにする。
    if (profileError?.message.includes('activated_at')) {
      profileError = (
        await admin.from('users').upsert(base, { onConflict: 'id' })
      ).error;
    }

    if (profileError) {
      // 認証ユーザーだけ残ると同じメールで作り直せなくなる
      await admin.auth.admin.deleteUser(data.user.id);
      log.error('user.profileFailed', { email, reason: profileError.message });
      throw new ApiError(
        'INTERNAL_ERROR',
        `プロフィールの作成に失敗しました: ${profileError.message}`
      );
    }

    log.info('user.created', { email, role, userId: data.user.id });

    return NextResponse.json(
      {
        ok: true,
        user: { id: data.user.id, email, name, role },
        message: `${email} を追加しました`,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
});
