'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';

const STAFF_ITEMS = [
  { href: '/clock', label: '打刻', icon: '⏱' },
  { href: '/salary', label: '給与', icon: '¥' },
  { href: '/shifts', label: 'シフト', icon: '📋' },
  { href: '/calendar', label: '予約', icon: '📅' },
];

const ADMIN_ITEMS = [
  { href: '/admin', label: 'ホーム', icon: '🏠' },
  { href: '/admin/shifts', label: 'シフト', icon: '📋' },
  { href: '/calendar', label: '予約', icon: '📅' },
  { href: '/admin/attendance', label: '勤怠', icon: '⏱' },
  { href: '/admin/settings', label: '設定', icon: '⚙' },
];

/**
 * スマホ用の下部固定ナビ。
 * safe-area-inset-bottom で iPhone のホームバーを避ける。
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const items = isAdmin ? ADMIN_ITEMS : STAFF_ITEMS;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/admin' && pathname.startsWith(`${item.href}/`));

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'text-blue-600'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
