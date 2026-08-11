import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from '@/app/types/domain';
import { createServerSupabase } from '@/app/lib/supabase/server';
import { ApiError } from './errors';

export interface AuthContext {
  supabase: SupabaseClient;
  profile: UserProfile;
}

/**
 * ログイン必須のハンドラで使う。
 *
 * 返す supabase クライアントは Cookie のセッションを持つため
 * RLS が効いた状態でクエリが走る。API 層にバグがあっても
 * DB が最後の砦になる。
 */
export async function requireUser(): Promise<AuthContext> {
  const supabase = await createServerSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new ApiError('UNAUTHORIZED');
  }

  const { data: row } = await supabase
    .from('users')
    .select('id, email, name, role, is_active')
    .eq('id', user.id)
    .single();

  if (!row) {
    throw new ApiError('UNAUTHORIZED', 'プロフィールが見つかりません');
  }

  if (!row.is_active) {
    throw new ApiError('FORBIDDEN', 'このアカウントは無効化されています');
  }

  return {
    supabase,
    profile: {
      id: row.id,
      email: row.email,
      name: row.name ?? '',
      role: row.role,
      isActive: row.is_active,
    },
  };
}

/**
 * 管理者必須のハンドラで使う。
 *
 * role は JWT ではなく users テーブルを引いて判定する。
 * JWT に焼き込むと降格が次回トークン更新まで反映されないため。
 */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();

  if (ctx.profile.role !== 'admin') {
    throw new ApiError('FORBIDDEN', '管理者権限が必要です');
  }

  return ctx;
}
