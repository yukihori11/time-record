'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import Button from '@/app/components/ui/Button';
import { Field, Input } from '@/app/components/ui/Field';
import { ErrorBanner, SuccessBanner } from '@/app/components/ui/Feedback';

const MIN_LENGTH = 8;

/**
 * メールのリンクから来たときのパスワード再設定。
 *
 * Supabase はトークンを URL のハッシュ（#access_token=...）に付ける。
 * ハッシュはサーバーに送られないため、ここで読み取って
 * API に渡し、サーバー側でセッションを確立する。
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tokens, setTokens] = useState<{
    accessToken: string;
    refreshToken: string;
  } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);

    const errorDescription = params.get('error_description');
    if (errorDescription) {
      setLinkError(
        'リンクの有効期限が切れています。もう一度お試しください。'
      );
      return;
    }

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (accessToken && refreshToken) {
      setTokens({ accessToken, refreshToken });
      // トークンを URL に残さない
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      // メールのリンクから来たのにトークンが無い場合。
      // 一部のメールクライアントは URL のハッシュを削ることがある。
      // ここで通してしまうと、別人がログイン中の端末で開いたときに
      // その人のパスワードを変えてしまうため止める。
      setLinkError(
        'リンクからパスワードを再設定できませんでした。もう一度メールを送信してください。'
      );
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`パスワードは${MIN_LENGTH}文字以上で設定してください`);
      return;
    }

    if (password !== confirm) {
      setError('パスワードが一致しません');
      return;
    }

    setLoading(true);

    try {
      await api.post('/api/auth/reset-password', {
        password,
        fromResetLink: true,
        ...(tokens ?? {}),
      });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-10 bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            新しいパスワード
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {MIN_LENGTH}文字以上で設定してください
          </p>
        </div>

        {linkError ? (
          <div className="space-y-6">
            <ErrorBanner message={linkError} />
            <Link href="/forgot-password" className="block">
              <Button size="lg" fullWidth>
                もう一度メールを送る
              </Button>
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-6">
            <SuccessBanner message="パスワードを変更しました。ログイン画面に移動します。" />
            <Link href="/login" className="block">
              <Button variant="secondary" size="lg" fullWidth>
                ログイン画面へ
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <ErrorBanner message={error} />

            <Field label="新しいパスワード" required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_LENGTH}
                autoComplete="new-password"
                placeholder="••••••••"
              />
            </Field>

            <Field label="確認のためもう一度" required>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={MIN_LENGTH}
                autoComplete="new-password"
                placeholder="••••••••"
              />
            </Field>

            <Button type="submit" size="lg" fullWidth loading={loading}>
              パスワードを変更する
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
