'use client';

import { useAuth } from '@/app/contexts/AuthContext';

/**
 * 画面上部の見出し。
 *
 * ログアウトはスマホでのみここに出す。
 * PCでは左サイドバーの下部にあるため重複させない。
 */
export default function AppHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const { user, signOut } = useAuth();

  return (
    <header
      className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs text-slate-500 truncate">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {action}
          {user && (
            <button
              onClick={signOut}
              className="md:hidden text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-100"
            >
              ログアウト
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
