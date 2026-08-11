'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { usePushNotification } from '@/app/hooks/usePushNotification';
import { useInstallPrompt } from '@/app/hooks/useInstallPrompt';
import Button from '@/app/components/ui/Button';
import { Card } from '@/app/components/ui/Feedback';

/**
 * 通知の設定。
 *
 * 状態の表示と、有効化・解除をここにまとめている。
 * 以前はバナーと状態カードが別々にあり、
 * 未設定のときに「通知を有効にする」が2つ出ていた。
 */
export default function NotificationStatus() {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const {
    permission,
    subscribed,
    busy,
    needsInstall,
    needsSafari,
    subscribe,
    unsubscribe,
  } = usePushNotification();

  const { canInstall, installed, install } = useInstallPrompt();

  const state = (() => {
    if (permission === 'unsupported') {
      return {
        label: '非対応',
        color: 'bg-slate-200 text-slate-600',
        message: 'このブラウザは通知に対応していません',
      };
    }
    if (needsSafari) {
      return {
        label: '設定できません',
        color: 'bg-amber-100 text-amber-700',
        message:
          'iPhone では Safari で開いた場合のみ設定できます。Safari で開き直してください',
      };
    }
    if (permission === 'denied') {
      return {
        label: 'ブロック中',
        color: 'bg-red-100 text-red-600',
        message:
          'ブラウザの設定で通知が拒否されています。サイトの設定から許可し直してください',
      };
    }
    if (needsInstall) {
      return {
        label: '追加が必要',
        color: 'bg-amber-100 text-amber-700',
        message:
          '画面下の共有ボタン（□に↑）から「ホーム画面に追加」し、追加したアイコンから開き直してください',
      };
    }
    if (subscribed) {
      return {
        label: '受け取る',
        color: 'bg-emerald-100 text-emerald-700',
        message: 'シフトが割り当てられたときに通知が届きます',
      };
    }
    return {
      label: '受け取らない',
      color: 'bg-slate-200 text-slate-600',
      message: '有効にすると、シフトの割当をすぐ知ることができます',
    };
  })();

  /**
   * 自分にテスト通知を送る。
   *
   * 「有効にしたのに届かない」ときの切り分けに使う。
   * 端末は購読済みでもサーバーに登録が無い場合があり、
   * その場合はここで気づける。
   */
  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<{ sent: number }>('/api/push/test');
      setTestResult(
        res.sent > 0
          ? '送信しました。通知欄を確認してください'
          : '送信先が見つかりません。一度解除して有効にし直してください'
      );
    } catch (err) {
      setTestResult(errorMessage(err));
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 6000);
    }
  };

  const canToggle =
    permission !== 'unsupported' &&
    permission !== 'denied' &&
    !needsSafari &&
    !needsInstall;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="font-bold text-slate-900">シフトの通知</h2>
        <span
          className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${state.color}`}
        >
          {state.label}
        </span>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">{state.message}</p>

      {subscribed && (
        <p className="text-xs text-slate-400 mt-1.5">
          設定は端末ごとです。他の端末でも受け取るには、
          その端末でも有効にしてください。
        </p>
      )}

      {canToggle && (
        <Button
          size="md"
          fullWidth
          variant={subscribed ? 'secondary' : 'primary'}
          loading={busy}
          className="mt-3"
          onClick={subscribed ? unsubscribe : subscribe}
        >
          {subscribed ? 'この端末で受け取らない' : '通知を有効にする'}
        </Button>
      )}

      {/* 届かないときの確認用。テスト通知を自分に送る */}
      {subscribed && (
        <Button
          size="md"
          fullWidth
          variant="ghost"
          loading={testing}
          className="mt-2"
          onClick={sendTest}
        >
          {testResult ?? 'テスト通知を送る'}
        </Button>
      )}

      {/* Chrome などアプリとして入れられる環境では勧める */}
      {canInstall && !installed && (
        <Button
          size="md"
          fullWidth
          variant="secondary"
          className="mt-2"
          onClick={install}
        >
          ホーム画面に追加
        </Button>
      )}
    </Card>
  );
}
