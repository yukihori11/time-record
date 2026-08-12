import 'server-only';

import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from '@/app/types/domain';
import { requireAdmin, requireUser } from '@/app/lib/api/auth';
import { log } from '@/app/lib/api/logger';

/**
 * 画面（Server Component）用の権限チェック。
 *
 * API 用の requireAdmin は例外を投げる。それをページで使うと
 * バイト生が /admin を開いたときに 500 になってしまう。
 * 画面では追い返すのが正しいので、ここで転送に変換する。
 *
 * これを各ページの先頭に置くと、権限が無い相手には
 * 枠すら描画されない。RoleGuard は画面が描画されてから
 * 判定するため、一瞬だけ管理画面の見た目が見えてしまう。
 */

interface Guarded {
  supabase: SupabaseClient;
  profile: UserProfile;
}

/** 管理者のみ。バイト生は打刻画面へ、未ログインはログインへ。 */
export async function guardAdminPage(path: string): Promise<Guarded> {
  // 未ログインか、権限が足りないかを分けたい。
  // redirect() は例外で制御を移すため、try の外で呼ぶ。
  let profile: UserProfile | null = null;

  try {
    return await requireAdmin();
  } catch {
    try {
      profile = (await requireUser()).profile;
    } catch {
      profile = null;
    }
  }

  if (!profile) {
    redirect(`/login?redirect=${encodeURIComponent(path)}`);
  }

  // ログイン済みだが管理者ではない。監査上、記録を残す。
  log.warn('page.forbidden', {
    userId: profile.id,
    email: profile.email,
    role: profile.role,
    path,
  });
  redirect('/clock');
}
