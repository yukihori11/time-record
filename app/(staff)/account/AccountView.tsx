'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { useAuth } from '@/app/contexts/AuthContext';
import Button from '@/app/components/ui/Button';
import { Field, Input } from '@/app/components/ui/Field';
import {
  Card,
  ErrorBanner,
  SuccessBanner,
} from '@/app/components/ui/Feedback';
import NotificationStatus from '@/app/components/NotificationStatus';

const MIN_LENGTH = 8;

/**
 * 自分のアカウント設定。
 *
 * ログインした状態でパスワードを変更できる。
 * メールのリンクを経由しないため、メールが届かない・
 * リンクが期限切れといった問題に左右されない。
 */
export default function AccountView() {
  const { user, reload, signOut } = useAuth();
  const router = useRouter();

  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameDone, setNameDone] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPass, setSavingPass] = useState(false);
  const [passDone, setPassDone] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNameDone(null);
    setSavingName(true);

    try {
      await api.patch('/api/me', { name });
      await reload();
      setNameDone('氏名を変更しました');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPassDone(null);

    if (password.length < MIN_LENGTH) {
      setError(`パスワードは${MIN_LENGTH}文字以上で設定してください`);
      return;
    }
    if (password !== confirm) {
      setError('パスワードが一致しません');
      return;
    }

    setSavingPass(true);
    try {
      // ログイン済みのユーザー自身のパスワードを変える
      await api.post('/api/me/password', { password });

      setPassword('');
      setConfirm('');
      setPassDone(
        'パスワードを変更しました。次回のログインから新しいパスワードを使ってください'
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />

      {/* 通知の設定 */}
      <NotificationStatus />

      {/* 氏名 */}
      <Card className="p-4">
        <h2 className="font-bold text-slate-900 mb-1">表示名</h2>
        <p className="text-xs text-slate-500 mb-3">
          シフトやカレンダーに表示される名前です
        </p>

        <SuccessBanner message={nameDone} />

        <form onSubmit={saveName} className="space-y-3 mt-2">
          <Field label="氏名">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="田中 太郎"
            />
          </Field>

          <Button type="submit" fullWidth loading={savingName}>
            保存する
          </Button>
        </form>
      </Card>

      {/* パスワード */}
      <Card className="p-4">
        <h2 className="font-bold text-slate-900 mb-1">パスワードの変更</h2>
        <p className="text-xs text-slate-500 mb-3">
          {MIN_LENGTH}文字以上で設定してください
        </p>

        <SuccessBanner message={passDone} />

        <form onSubmit={savePassword} className="space-y-3 mt-2">
          <Field label="新しいパスワード" required>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={MIN_LENGTH}
              autoComplete="new-password"
              placeholder="••••••••"
              required
            />
          </Field>

          <Field label="確認のためもう一度" required>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={MIN_LENGTH}
              autoComplete="new-password"
              placeholder="••••••••"
              required
            />
          </Field>

          <Button
            type="submit"
            fullWidth
            loading={savingPass}
            disabled={!password || !confirm}
          >
            パスワードを変更する
          </Button>
        </form>
      </Card>

      {/* アカウント情報 */}
      <Card className="p-4">
        <h2 className="font-bold text-slate-900 mb-3">アカウント</h2>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">メールアドレス</dt>
            <dd className="text-slate-800 truncate ml-2">{user?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">権限</dt>
            <dd className="text-slate-800">
              {user?.role === 'admin' ? '管理者' : 'バイト生'}
            </dd>
          </div>
        </dl>

        <Button
          variant="secondary"
          fullWidth
          className="mt-4"
          onClick={async () => {
            await signOut();
            router.push('/login');
          }}
        >
          ログアウト
        </Button>
      </Card>
    </div>
  );
}
