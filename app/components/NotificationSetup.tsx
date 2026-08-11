'use client';

import { useState, useSyncExternalStore } from 'react';
import { usePushNotification } from '@/app/hooks/usePushNotification';
import { useInstallPrompt } from '@/app/hooks/useInstallPrompt';
import Button from '@/app/components/ui/Button';

const DISMISS_KEY = 'notification-prompt-dismissed';

/**
 * 「閉じる」を押したかどうかを読む。
 *
 * localStorage はサーバーには存在しないため、
 * サーバー描画時は「閉じた」扱いにして何も出さない。
 * useEffect で後から setState すると画面がちらつく。
 */
function subscribeToDismiss(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getDismissed(): boolean {
  return window.localStorage.getItem(DISMISS_KEY) === '1';
}

/**
 * 通知を有効にしてもらうための案内。
 *
 * ブラウザによって必要な手順が違う:
 *   Chrome / Edge — そのまま通知を許可できる。アプリとしても入れられる
 *   Safari (iOS)  — ホーム画面に追加しないと通知を許可できない
 */
export default function NotificationSetup() {
  const {
    permission,
    subscribed,
    busy,
    needsInstall,
    needsSafari,
    subscribe,
  } = usePushNotification();
  const { canInstall, installed, install } = useInstallPrompt();

  const stored = useSyncExternalStore(
    subscribeToDismiss,
    getDismissed,
    () => true // サーバー描画時は出さない
  );
  const [closedNow, setClosedNow] = useState(false);
  const dismissed = stored || closedNow;

  const close = () => {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setClosedNow(true);
  };

  if (dismissed || permission === 'unsupported' || permission === 'denied') {
    return null;
  }

  // 通知は有効。あとはアプリとして入れられるなら勧める。
  if (subscribed) {
    if (!canInstall || installed) return null;

    return (
      <Banner onClose={close}>
        <p className="text-sm font-bold text-blue-900">
          アプリとして使えます
        </p>
        <p className="text-xs text-blue-700 mt-1">
          ホーム画面に追加すると、すぐ開けて全画面で使えます
        </p>
        <Button
          size="md"
          fullWidth
          className="mt-3"
          onClick={async () => {
            const ok = await install();
            if (!ok) close();
          }}
        >
          ホーム画面に追加
        </Button>
      </Banner>
    );
  }

  // iPhone の Chrome などは中身が Safari だが「ホーム画面に追加」が
  // 使えず、通知を有効にできない。Safari で開き直してもらう。
  if (needsSafari) {
    return (
      <Banner onClose={close}>
        <p className="text-sm font-bold text-blue-900">
          通知には Safari が必要です
        </p>
        <p className="text-xs text-blue-700 mt-1.5 leading-relaxed">
          iPhone では Safari で開いた場合のみ通知を設定できます。
          このページを Safari で開き直してから、
          「ホーム画面に追加」してください。
        </p>
        <button
          onClick={() => {
            void navigator.clipboard
              ?.writeText(window.location.href)
              .catch(() => {});
          }}
          className="mt-2.5 text-xs font-semibold text-blue-700 underline"
        >
          このページのURLをコピー
        </button>
      </Banner>
    );
  }

  // iOS は先にホーム画面へ追加しないと通知を許可できない
  if (needsInstall) {
    return (
      <Banner onClose={close}>
        <p className="text-sm font-bold text-blue-900">
          シフトの通知を受け取る
        </p>
        <p className="text-xs text-blue-700 mt-1.5 leading-relaxed">
          画面下の共有ボタン
          <span className="inline-block mx-1 font-bold">⬆</span>
          をタップし、「ホーム画面に追加」を選んでください。
          追加後にこの画面を開くと、通知を有効にできます。
        </p>
      </Banner>
    );
  }

  return (
    <Banner onClose={close}>
      <p className="text-sm font-bold text-blue-900">
        シフトの通知を受け取りますか？
      </p>
      <p className="text-xs text-blue-700 mt-1">
        シフトが割り当てられたときにお知らせします
      </p>

      <div className="flex gap-2 mt-3">
        <Button
          size="md"
          fullWidth
          loading={busy}
          onClick={async () => {
            const ok = await subscribe();
            if (!ok) close();
          }}
        >
          通知を有効にする
        </Button>

        {/* Chrome などインストール可能な環境では同時に勧める */}
        {canInstall && !installed && (
          <Button size="md" variant="secondary" onClick={install}>
            追加
          </Button>
        )}
      </div>
    </Banner>
  );
}

function Banner({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          onClick={onClose}
          className="shrink-0 text-blue-400 hover:text-blue-600 text-lg leading-none px-1"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
    </div>
  );
}
