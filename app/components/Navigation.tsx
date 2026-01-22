'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

export default function Navigation() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <div className="bg-white shadow-md mb-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center">
          <div className="flex gap-4">
            <Link
              href="/"
              className={`px-6 py-4 font-semibold transition-colors border-b-4 ${
                pathname === '/'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              タイマー
            </Link>
            <Link
              href="/calendar"
              className={`px-6 py-4 font-semibold transition-colors border-b-4 ${
                pathname === '/calendar'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              カレンダー
            </Link>
          </div>

          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.name || user.email}</span>
              <button
                onClick={signOut}
                className="px-4 py-2 text-sm bg-gray-200 text-black rounded-lg hover:bg-gray-300 transition-colors"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
