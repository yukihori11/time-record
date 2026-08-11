'use client';

import type { ReactNode } from 'react';

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
    >
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm"
    >
      {message}
    </div>
  );
}

export function Spinner({ label = '読み込み中' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <span className="w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="text-center py-12 px-4">
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      <p className="text-slate-700 font-semibold">{title}</p>
      {description && (
        <p className="text-sm text-slate-500 mt-1.5">{description}</p>
      )}
    </div>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-slate-200 ${className}`}
    >
      {children}
    </div>
  );
}
