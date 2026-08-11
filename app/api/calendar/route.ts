import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { toProperty, toReservation, toShift } from '@/app/lib/api/mappers';
import { monthStr } from '@/app/lib/api/validate';
import { monthRange } from '@/app/lib/domain/datetime';

/**
 * カレンダー画面に必要なデータを1回で返す。
 *
 * 予約・棟・シフト・スタッフ名を別々のAPIで取ると、
 * その回数だけ認証（Supabase認証サーバーへの往復）が発生する。
 * まとめることで認証1回・DBは並列4クエリで済む。
 */
export async function GET(request: Request) {
  try {
    const { supabase, profile } = await requireUser();

    const url = new URL(request.url);
    const month = monthStr(url.searchParams.get('month'), 'month');
    const { from, to } = monthRange(month);

    const [reservationsRes, propertiesRes, shiftsRes, usersRes] =
      await Promise.all([
        supabase
          .from('reservations')
          .select('*')
          .eq('status', 'confirmed')
          .lte('check_in', to)
          .gt('check_out', from)
          .order('check_in'),
        supabase
          .from('properties')
          .select('*')
          .eq('is_active', true)
          .order('display_order'),
        supabase
          .from('shifts')
          .select('*')
          .gte('shift_date', from)
          .lte('shift_date', to)
          .order('shift_date'),
        supabase.rpc('list_staff_names'),
      ]);

    if (reservationsRes.error) throw reservationsRes.error;

    return NextResponse.json({
      reservations: (reservationsRes.data ?? []).map(toReservation),
      properties: (propertiesRes.data ?? []).map(toProperty),
      shifts: (shiftsRes.data ?? []).map(toShift),
      users: (usersRes.data ?? []).map((u: { id: string; name: string }) => ({
        id: u.id,
        email: '',
        name: u.name ?? '',
        role: 'staff' as const,
        isActive: true,
      })),
      currentUserId: profile.id,
      isAdmin: profile.role === 'admin',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
