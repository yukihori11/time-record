'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './contexts/AuthContext';
import { Spinner } from './components/ui/Feedback';

/**
 * 入口。ロールに応じて振り分ける。
 *
 * あわせてパスワード再設定のリンクも受ける。
 * Supabase の Redirect URLs の設定次第では、指定した
 * リンク先が無視されてここ（Site URL）に飛ばされる。
 * その場合でもパスワードを設定できるよう、
 * 認証用のパラメータが付いていたら再設定画面へ送る。
 */
export default function Home() {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // 認証情報が付いているかを先に見る。
    // ログイン状態の判定より前に処理しないと、
    // 未ログイン扱いでログイン画面に飛んでしまう。
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    // PKCE 方式は ?code=、旧方式は #access_token= で届く
    const code = search.get('code');
    const accessToken = hash.get('access_token');
    const type = search.get('type') ?? hash.get('type');
    const errorDescription =
      search.get('error_description') ?? hash.get('error_description');

    if (errorDescription) {
      router.replace(
        `/reset-password?error_description=${encodeURIComponent(errorDescription)}`
      );
      return;
    }

    if (code) {
      // サーバーで code を交換してからパスワード設定画面へ
      router.replace(`/auth/callback?code=${code}&next=/reset-password`);
      return;
    }

    if (accessToken) {
      // ハッシュはそのまま引き継ぐ必要がある。
      // router では失われるため location で遷移する。
      window.location.replace(`/reset-password${window.location.hash}`);
      return;
    }

    // recovery だがトークンが無い場合も再設定画面で案内する
    if (type === 'recovery') {
      router.replace('/reset-password');
      return;
    }

    if (loading) return;
    router.replace(!user ? '/login' : isAdmin ? '/admin' : '/clock');
  }, [user, loading, isAdmin, router]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50">
      <Spinner />
    </div>
  );
}
