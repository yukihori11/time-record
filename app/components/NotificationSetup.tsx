'use client';

import { useSyncExternalStore, useState } from 'react';
import { usePushNotification } from '@/app/hooks/usePushNotification';
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
 * シフトの割当に気づいてもらうことが目的なので、
 * まだ許可していない人にだけ出す。
 * 閉じたら当面出さない（毎回出ると煩わしいため）。
 */
export default function NotificationSetup() {
  const {
    permission,
    subscribed,
    busy,
    needsInstall,
    subscribe,
  } = usePushNotification();

  // localStorage は表示制御にのみ使う。打刻の状態には使わない。
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

  // 既に有効・非対応・拒否済み・閉じた後は出さない
  if (
    dismissed ||
    subscribed ||
    permission === 'unsupported' ||
    permission === 'denied'
  ) {
    return null;
  }

  // iOS はホーム画面に追加しないと通知を許可できない
  if (needsInstall) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-blue-900">
              シフトの通知を受け取る
            </p>
            <p className="text-xs text-blue-700 mt-1.5 leading-relaxed">
              下の共有ボタン
              <span className="inline-block mx-1 font-bold">⬆</span>
              から「ホーム画面に追加」すると、
              シフトが割り当てられたときに通知が届きます。
            </p>
          </div>
          <button
            onClick={close}
            className="shrink-0 text-blue-400 hover:text-blue-600 text-lg leading-none px-1"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-blue-900">
            シフトの通知を受け取りますか？
          </p>
          <p className="text-xs text-blue-700 mt-1">
            シフトが割り当てられたときにお知らせします
          </p>
        </div>
        <button
          onClick={close}
          className="shrink-0 text-blue-400 hover:text-blue-600 text-lg leading-none px-1"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>

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
    </div>
  );
}
