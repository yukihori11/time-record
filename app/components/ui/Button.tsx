'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
  secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300 active:bg-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-base rounded-xl',
  // スマホで押しやすいよう最低44pxの高さを確保
  lg: 'px-6 py-3.5 text-lg rounded-xl min-h-[52px]',
  xl: 'px-8 py-6 text-2xl rounded-2xl min-h-[80px] font-bold',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`
        ${VARIANTS[variant]} ${SIZES[size]}
        ${fullWidth ? 'w-full' : ''}
        font-semibold transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500
        inline-flex items-center justify-center gap-2
        touch-manipulation select-none
        ${className}
      `}
    >
      {loading && (
        <span
          className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
