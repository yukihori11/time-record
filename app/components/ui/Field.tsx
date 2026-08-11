'use client';

import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const BASE =
  'w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-base ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ' +
  'disabled:bg-slate-100 disabled:text-slate-500';

interface LabelProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function Field({ label, hint, required, children }: LabelProps) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1.5">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${BASE} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${BASE} ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={`${BASE} min-h-[88px] ${props.className ?? ''}`} />
  );
}
