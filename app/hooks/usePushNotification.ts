'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/app/lib/client/fetcher';
import { detectBrowser, isPushSupported } from '@/app/lib/domain/browser';

type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

/**
 * base64url の公開鍵を Push API が要求する形式に変換する。
 *
 * ArrayBuffer を明示的に確保しているのは、Uint8Array の
 * 既定の型が SharedArrayBuffer も含みうるため。
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);

  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    view[i] = raw.charCodeAt(i);
  }
  return view;
}

/**
 * プッシュ通知の購読を管理する。
 *
 * iOS では「ホーム画面に追加」しないと通知が使えないため、
 * その判定も返す。
 */
export function usePushNotification() {
  const [permission, setPermission] = useState<PermissionState>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isIosNonSafari, setIsIosNonSafari] = useState(false);

  useEffect(() => {
    // iOS Safari はホーム画面に追加するまで PushManager を持たない。
    // API の有無だけで判定すると誤って「非対応」になる。
    const supported = isPushSupported({
      userAgent: navigator.userAgent,
      hasServiceWorker: 'serviceWorker' in navigator,
      hasPushManager: 'PushManager' in window,
      hasNotification: 'Notification' in window,
    });

    if (!supported) {
      setPermission('unsupported');
    } else if ('Notification' in window) {
      setPermission(Notification.permission as PermissionState);
    } else {
      // iOS Safari の追加前。まだ許可を求められる状態ではない
      setPermission('default');
    }

    // ホーム画面から起動しているか
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        // iOS Safari 独自の判定
        (window.navigator as { standalone?: boolean }).standalone === true
    );

    // 判定は browser.ts に集約している（テスト済み）
    const { isIos: ios, isIosNonSafari: iosOther } = detectBrowser(
      navigator.userAgent
    );
    setIsIos(ios);
    setIsIosNonSafari(iosOther);

    // 購読の状態を確認する。
    //
    // 端末側だけを見ると、DBの登録が消えた場合に
    // 「受け取る」と表示されたまま通知が届かなくなる。
    // ユーザーを作り直すと購読も CASCADE で消えるため、
    // 実際にこの状態が起きた。
    //
    // 食い違っていたら黙って登録し直す。
    if (supported) {
      void (async () => {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();

          if (!sub) {
            setSubscribed(false);
            return;
          }

          const res = await api.get<{ registered: boolean }>(
            `/api/push/status?endpoint=${encodeURIComponent(sub.endpoint)}`
          );

          if (res.registered) {
            setSubscribed(true);
            return;
          }

          // 端末は購読しているのにサーバーに無い。登録し直す。
          await api.post('/api/push/subscribe', {
            subscription: sub.toJSON(),
          });
          setSubscribed(true);
        } catch {
          setSubscribed(false);
        }
      })();
    }
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      // iOS Safari はホーム画面に追加するまで Notification を持たない。
      // ここに来る前に案内を出しているが、念のため守る。
      if (!('Notification' in window)) {
        console.warn('[push] この状態では通知を許可できません');
        return false;
      }

      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      if (result !== 'granted') return false;

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        console.error('[push] VAPID の公開鍵が設定されていません');
        return false;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await api.post('/api/push/subscribe', {
        subscription: subscription.toJSON(),
      });

      setSubscribed(true);
      return true;
    } catch (error) {
      console.error('[push] 購読に失敗:', error);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // どの端末の購読を消すかを endpoint で指定する。
        // 指定しないとサーバー側で対象を特定できない。
        await api
          .delete('/api/push/subscribe', { endpoint: subscription.endpoint })
          .catch(() => {});
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch (error) {
      console.error('[push] 解除に失敗:', error);
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    permission,
    subscribed,
    busy,
    // iOS はホーム画面に追加しないと通知を許可できない
    needsInstall: isIos && !isStandalone && !isIosNonSafari,
    // iPhone の Chrome などでは、そもそも追加ができないため
    // Safari で開き直してもらう必要がある
    needsSafari: isIosNonSafari,
    isStandalone,
    subscribe,
    unsubscribe,
  };
}
