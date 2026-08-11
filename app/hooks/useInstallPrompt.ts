'use client';

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * ホーム画面への追加（PWAのインストール）を管理する。
 *
 * Chrome / Edge は beforeinstallprompt を発火させるので、
 * それを捕まえて任意のタイミングでインストールを促せる。
 * Safari はこのイベントを持たないため、手順を文章で案内する。
 */
/** ホーム画面から起動しているか。描画のたびに変わらないので関数で読む */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  // 初期値として1回だけ判定する。effect で setState すると
  // 不要な再描画とちらつきが起きる。
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    // ブラウザが「インストールできる」と判断したときに発火する。
    // 既定の案内を止めて、こちらのタイミングで出す。
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  /** インストールの確認ダイアログを出す（Chrome / Edge のみ） */
  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    // 一度使ったイベントは再利用できない
    setDeferredPrompt(null);
    return outcome === 'accepted';
  }, [deferredPrompt]);

  return {
    /** ボタンからインストールを促せるか */
    canInstall: Boolean(deferredPrompt),
    /** ホーム画面から起動しているか */
    installed,
    install,
  };
}
