'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';

/**
 * 画面側の権限チェック。
 *
 * これは UX のためのもので、セキュリティの担保ではない。
 * 実際の防御は次の3層が担う:
 *   - middleware が未認証のページ遷移を弾く
 *   - API の requireUser / requireAdmin
 *   - DB の RLS
 *
 * このガードは「読み込み中だから隠す」ことをしない。
 * ページは Server Component が認証済みで描画しているため、
 * ここで待つと中身があるのにスピナーが出続けることになる。
 * 権限が足りないと分かった時点でだけ追い出す。
 */
export default function RoleGuard({
  requireAdmin = false,
  children,
}: {
  requireAdmin?: boolean;
  children: React.ReactNode;
}) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // プロフィールの取得が終わるまでは判断できない
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (requireAdmin && !isAdmin) {
      router.replace('/clock');
    }
  }, [user, loading, isAdmin, requireAdmin, router]);

  // 権限が無いと確定した場合のみ隠す
  if (!loading && !user) return null;
  if (!loading && requireAdmin && !isAdmin) return null;

  return <>{children}</>;
}
