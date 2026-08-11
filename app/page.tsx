'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './contexts/AuthContext';
import { Spinner } from './components/ui/Feedback';

// ロールに応じて振り分ける
export default function Home() {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(!user ? '/login' : isAdmin ? '/admin' : '/clock');
  }, [user, loading, isAdmin, router]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50">
      <Spinner />
    </div>
  );
}
