import 'server-only';

import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from '@/app/types/domain';
import { createServerSupabase } from '@/app/lib/supabase/server';
import { ApiError } from './errors';
import { log } from './logger';

export interface AuthContext {
  supabase: SupabaseClient;
  profile: UserProfile;
}

/**
 * 認証の実処理。
 *
 * cache() で包むことで、同一リクエスト内では1回しか実行されない。
 * これが無いと、1つの画面で認証だけのために
 * Supabase の認証サーバーへ何度も往復することになる。
 */
const resolveAuth = cache(async (): Promise<AuthContext> => {
  const supabase = await createServerSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    // 未ログインは日常的に起きるので warn 止まり。
    // ただし理由は残す（トークン切れか、そもそも無いのか）
    log.warn('auth.unauthorized', {
      reason: error?.message ?? 'セッションなし',
    });
    throw new ApiError('UNAUTHORIZED');
  }

  const { data: row } = await supabase
    .from('users')
    .select('id, email, name, role, is_active')
    .eq('id', user.id)
    .single();

  if (!row) {
    // 認証は通ったのに users 行が無い。
    // トリガーの失敗か、手動削除の可能性がある。
    log.error('auth.profile_missing', { userId: user.id, email: user.email });
    throw new ApiError('UNAUTHORIZED', 'プロフィールが見つかりません');
  }

  if (!row.is_active) {
    log.warn('auth.inactive', { userId: row.id, email: row.email });
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
});

/**
 * ログイン必須のハンドラで使う。
 *
 * 返す supabase クライアントは Cookie のセッションを持つため
 * RLS が効いた状態でクエリが走る。API 層にバグがあっても
 * DB が最後の砦になる。
 */
export async function requireUser(): Promise<AuthContext> {
  return resolveAuth();
}

/**
 * 管理者必須のハンドラで使う。
 *
 * role は JWT ではなく users テーブルを引いて判定する。
 * JWT に焼き込むと降格が次回トークン更新まで反映されないため。
 */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await resolveAuth();

  if (ctx.profile.role !== 'admin') {
    // 権限のない操作の試行。監査上、必ず残す。
    log.warn('auth.forbidden', {
      userId: ctx.profile.id,
      email: ctx.profile.email,
      role: ctx.profile.role,
    });
    throw new ApiError('FORBIDDEN', '管理者権限が必要です');
  }

  return ctx;
}
