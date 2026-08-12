'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';

const STAFF_ITEMS = [
  { href: '/clock', label: '打刻', icon: '⏱' },
  { href: '/salary', label: '給与', icon: '¥' },
  { href: '/shifts', label: 'シフト', icon: '📋' },
  { href: '/calendar', label: '予定', icon: '📅' },
  { href: '/account', label: '設定', icon: '⚙' },
];

const ADMIN_ITEMS = [
  { href: '/admin', label: 'ホーム', icon: '🏠' },
  { href: '/calendar', label: '予定', icon: '📅' },
  { href: '/admin/attendance', label: '勤怠', icon: '⏱' },
  { href: '/admin/salary', label: '給与', icon: '¥' },
  { href: '/admin/wages', label: '時給', icon: '💰' },
  { href: '/admin/settings', label: '設定', icon: '⚙' },
];

function useNavItems() {
  const { isAdmin } = useAuth();
  return isAdmin ? ADMIN_ITEMS : STAFF_ITEMS;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * PC用の左サイドバー。
 * スマホでは下部固定ナビ（BottomNav）を使うため隠す。
 */
export function SideNav() {
  const pathname = usePathname();
  const items = useNavItems();
  const { user, signOut } = useAuth();

  return (
    <aside
      className="hidden md:flex md:flex-col md:w-56 md:shrink-0 border-r border-slate-200 bg-white
                 fixed inset-y-0 left-0 z-40 overflow-y-auto"
    >
      <div className="px-5 py-5 border-b border-slate-100">
        <p className="font-bold text-slate-900 leading-tight">民泊</p>
        <p className="text-xs text-slate-500">勤怠管理</p>
      </div>

      <nav className="flex-1 p-3">
        <ul className="space-y-1">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-3 px-3 py-2.5
                    rounded-xl text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  {/* 選択中は左端にバーを出す */}
                  {active && (
                    <span className="absolute left-0 inset-y-1.5 w-1 rounded-r bg-blue-600" />
                  )}
                  <span className="text-lg leading-none w-5 text-center" aria-hidden>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {user && (
        <div className="p-3 border-t border-slate-100">
          <p className="px-3 text-xs text-slate-500 truncate mb-1.5">
            {user.name || user.email}
          </p>
          <button
            onClick={signOut}
            className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 rounded-xl"
          >
            ログアウト
          </button>
        </div>
      )}
    </aside>
  );
}

/**
 * スマホ用の下部固定ナビ。
 * safe-area-inset-bottom で iPhone のホームバーを避ける。
 */
export function BottomNav() {
  const pathname = usePathname();
  const items = useNavItems();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1 min-w-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2.5
                  text-[11px] font-semibold transition-colors ${
                    active
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
              >
                {/* 選択中は上端にバーを出す。色だけより気づきやすい */}
                {active && (
                  <span className="absolute inset-x-0 top-0 h-0.5 bg-blue-600" />
                )}
                <span className="text-lg leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span className="truncate px-0.5">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * ナビと本文をまとめたレイアウト。
 * PCでは左サイドバー、スマホでは下部ナビになる。
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <SideNav />

      {/*
        サイドバーは fixed なので場所を取らない。
        その分の余白を md 以上で左に空ける（w-56 = 14rem）。
        下部ナビの高さぶんはスマホでのみ確保する。
      */}
      <div className="min-w-0 pb-20 md:pb-0 md:pl-56">{children}</div>

      <BottomNav />
    </div>
  );
}
