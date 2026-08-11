import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// このファイルはサーバー専用。
// 'server-only' により、クライアントコンポーネントから import した時点で
// ビルドエラーになる。Supabase の接続情報がブラウザに漏れることはない。

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  return value;
}

/**
 * リクエストの Cookie からセッションを読むクライアント。
 *
 * anon key を使うため RLS が有効。API 層にバグがあっても
 * DB のポリシーが最後の砦として機能する。
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
              });
            }
          } catch {
            // Server Component から呼ばれた場合は書き込めない。
            // middleware がセッション更新を担当するので問題ない。
          }
        },
      },
    }
  );
}

/**
 * RLS を迂回する管理用クライアント。
 *
 * 使用は初期セットアップとパスワードリセットに限定する。
 * 通常の CRUD では絶対に使わない（RLS が全て無効になるため）。
 */
export function createAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY が未設定です。Supabase ダッシュボードの Settings > API から取得してください'
    );
  }

  return createClient(requireEnv('SUPABASE_URL'), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
