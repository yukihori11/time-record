import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';

/**
 * スタッフ一覧。
 *
 * カレンダーでシフト担当者の名前を出すために必要。
 * ただし RLS により staff は自分の行しか読めないため、
 * 一般ユーザーには「シフトに登場する人の表示名」だけを返す。
 * メールアドレスは管理者にのみ開示する。
 */
export async function GET() {
  try {
    const { supabase, profile } = await requireUser();

    if (profile.role === 'admin') {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name, role, is_active')
        .order('name');

      if (error) throw error;

      return NextResponse.json({
        users: (data ?? []).map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name ?? '',
          role: u.role,
          isActive: u.is_active,
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
}
