import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';
import { enumValue, readBody, uuid } from '@/app/lib/api/validate';

type Params = { params: Promise<{ id: string }> };

/**
 * ロールと有効/無効の変更。
 *
 * どちらも SECURITY DEFINER 関数を経由する。
 * users テーブルへの直接 UPDATE は列権限で禁止されており、
 * 自己昇格ができない仕組みになっている。
 */
export const PATCH = withLogging('admin.users.id.patch', async (request: Request, { params }: Params) => {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;
    const userId = uuid(id, 'id');
    const body = await readBody(request);

    if (body.role !== undefined) {
      const role = enumValue(body.role, 'role', ['admin', 'staff'] as const);
      const { error } = await supabase.rpc('admin_set_user_role', {
        target_user_id: userId,
        new_role: role,
      });
      if (error) throw error;
    }

    if (body.isActive !== undefined) {
      const { error } = await supabase.rpc('admin_set_user_active', {
        target_user_id: userId,
        active: Boolean(body.isActive),
      });
      if (error) throw error;
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, is_active')
      .eq('id', userId)
      .single();

    if (error) throw error;

    return NextResponse.json({
      user: {
        id: data.id,
        email: data.email,
        name: data.name ?? '',
        role: data.role,
        isActive: data.is_active,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
