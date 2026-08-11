'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { Spinner } from '@/app/components/ui/Feedback';

/**
 * 画面側の権限チェック。
 *
 * これは UX のためのもので、セキュリティの担保ではない。
 * 実際の防御は API 層の requireAdmin と DB の RLS が行う。
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
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (requireAdmin && !isAdmin) {
      router.replace('/clock');
    }
  }, [user, loading, isAdmin, requireAdmin, router]);

  if (loading) return <Spinner />;
  if (!user) return null;
  if (requireAdmin && !isAdmin) return null;

  return <>{children}</>;
}
