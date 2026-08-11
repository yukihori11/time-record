import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';

/**
 * スタッフ一覧。
 *
 * カレンダーでシフト担当者の名前を出すために必要。
 * ただし RLS により staff は自分の行しか読めないため、
 * 一般ユーザーには「シフトに登場する人の表示名」だけを返す。
 * メールアドレスは管理者にのみ開示する。
 */
export const GET = withLogging('users.get', async () => {
  try {
    const { supabase, profile } = await requireUser();

    if (profile.role === 'admin') {
      // invited_at / activated_at はマイグレーション 0020 で追加した列。
      // 未適用の環境でも一覧が壊れないよう、失敗したら列なしで引き直す。
      let rows: Record<string, unknown>[] | null = null;

      const withInvite = await supabase
        .from('users')
        .select('id, email, name, role, is_active, invited_at, activated_at')
        .order('name');

      if (withInvite.error) {
        const fallback = await supabase
          .from('users')
          .select('id, email, name, role, is_active')
          .order('name');

        if (fallback.error) throw fallback.error;
        rows = fallback.data;
      } else {
        rows = withInvite.data;
      }

      return NextResponse.json({
        users: (rows ?? []).map((u) => ({
          id: u.id as string,
          email: u.email as string,
          name: (u.name as string) ?? '',
          role: u.role as 'admin' | 'staff',
          isActive: u.is_active as boolean,
          invitedAt: (u.invited_at as string | null) ?? null,
          // 列が無い環境では全員を利用中として扱う。
          // 招待の区別ができないだけで、他の機能は動く。
          activatedAt:
            'activated_at' in u
              ? ((u.activated_at as string | null) ?? null)
              : new Date(0).toISOString(),
        })),
      });
    }

    // スタッフには氏名だけを返す（メールは伏せる）
    const { data } = await supabase.rpc('list_staff_names');

    return NextResponse.json({
      users: (data ?? []).map((u: { id: string; name: string }) => ({
        id: u.id,
        email: '',
        name: u.name ?? '',
        role: 'staff' as const,
        isActive: true,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
