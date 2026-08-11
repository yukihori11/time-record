import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { toHourlyWage, toSettings } from '@/app/lib/api/mappers';
import { currentWage } from '@/app/lib/domain/wage-history';
import { todayJst } from '@/app/lib/domain/datetime';

// 自分のプロフィールと現在の時給。
// AuthContext が起動時に叩く。

export async function GET() {
  try {
    const { supabase, profile } = await requireUser();

    const [wagesRes, settingsRes] = await Promise.all([
      supabase
        .from('hourly_wages')
        .select('*')
        .eq('user_id', profile.id)
        .order('effective_from', { ascending: false }),
      supabase.from('app_settings').select('*').eq('id', 1).single(),
    ]);

    const wages = (wagesRes.data ?? []).map(toHourlyWage);

    return NextResponse.json({
      user: profile,
      currentWage: currentWage(wages, todayJst()),
      settings: settingsRes.data ? toSettings(settingsRes.data) : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    const body = await request.json();

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';

    const { data, error } = await supabase
      .from('users')
      .update({ name })
      .eq('id', profile.id)
      .select('id, email, name, role, is_active')
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
}
