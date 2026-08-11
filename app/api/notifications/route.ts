import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/api/auth';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';

/** 自分宛てのお知らせ一覧 */
export const GET = withLogging('notifications.get', async () => {
  try {
    const { supabase, profile } = await requireUser();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const notifications = (data ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      link: n.link,
      kind: n.kind,
      readAt: n.read_at,
      createdAt: n.created_at,
    }));

    return NextResponse.json({
      notifications,
      unreadCount: notifications.filter((n) => !n.readAt).length,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** まとめて既読にする */
export const PATCH = withLogging('notifications.patch', async () => {
  try {
    const { supabase, profile } = await requireUser();

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', profile.id)
      .is('read_at', null);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
