'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * スマホでは下から出るシート、デスクトップでは中央のモーダル。
 *
 * スマホでは上の帯（つまみと見出し）を下へスワイプすると閉じる。
 * 中身の部分はスクロールに使うので、スワイプは上の帯だけで受ける。
 */

/** これ以上下へ引いたら閉じる（px） */
const SWIPE_CLOSE_PX = 80;
export default function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    // 上へは動かさない
    setDragY(Math.max(0, e.touches[0].clientY - startY.current));
  };
  const onTouchEnd = () => {
    const moved = dragY;
    startY.current = null;
    setDragY(0);
    if (moved >= SWIPE_CLOSE_PX) onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col ${
          dragY === 0 ? 'transition-transform duration-200' : ''
        }`}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="shrink-0 touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {/* スワイプで閉じられることを示すつまみ。スマホだけ */}
          <div className="sm:hidden flex justify-center pt-2 -mb-1">
            <span className="w-10 h-1.5 rounded-full bg-slate-300" />
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h2 className="font-bold text-slate-900">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 text-xl leading-none"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-4 py-4 flex-1">{children}</div>

        {footer && (
          <div
            className="px-4 py-3 border-t border-slate-200 shrink-0"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
