'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import Button from '@/app/components/ui/Button';
import { Field, Input } from '@/app/components/ui/Field';
import {
  ErrorBanner,
  Spinner,
  SuccessBanner,
} from '@/app/components/ui/Feedback';

const MIN_LENGTH = 8;

type Phase = 'verifying' | 'ready' | 'invalid' | 'done';

/**
 * 招待・パスワード再設定の画面。
 *
 * Supabase のメールリンクには2つの形式がある:
 *   1. ?token_hash=...&type=invite  （現行。サーバーで verifyOtp する）
 *   2. #access_token=...            （旧形式。setSession で復元する）
 *
 * どちらで来ても設定できるよう両方を受ける。
 */
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [phase, setPhase] = useState<Phase>('verifying');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [tokens, setTokens] = useState<{
    accessToken: string;
    refreshToken: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const hash = window.location.hash.replace(/^#/, '');
      const hashParams = new URLSearchParams(hash);

      // リンク自体がエラーを返している場合
      const hashError = hashParams.get('error_description');
      const queryError = searchParams.get('error_description');
      if (hashError || queryError) {
        setInvalidReason(
          'リンクの有効期限が切れています。もう一度お試しください。'
        );
        setPhase('invalid');
        return;
      }

      // 旧形式: ハッシュにトークンが入っている
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken && refreshToken) {
        setTokens({ accessToken, refreshToken });
        window.history.replaceState(null, '', window.location.pathname);
        setPhase('ready');
        return;
      }

      // 現行: クエリの token_hash をサーバーで検証してセッションを張る
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type') ?? 'invite';

      if (tokenHash) {
        try {
          const res = await api.post<{ email: string }>(
            '/api/auth/verify-invite',
            { tokenHash, type }
          );
          setEmail(res.email);
          // トークンを URL に残さない
          window.history.replaceState(null, '', window.location.pathname);
          setPhase('ready');
        } catch (err) {
          setInvalidReason(errorMessage(err));
          setPhase('invalid');
        }
        return;
      }

      // トークンが無い場合。既にログイン済みなら変更を許す
      // （設定画面からパスワードを変えたい場合）
      try {
        await api.get('/api/me');
        setPhase('ready');
      } catch {
        setInvalidReason(
          'このページはメールのリンクから開いてください。'
        );
        setPhase('invalid');
      }
    })();
  }, [searchParams]);

  const submit = async (e: React.FormEvent) => {
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

    setSaving(true);
    try {
      await api.post('/api/auth/reset-password', {
        password,
        // 旧形式のトークンがあれば渡す
        ...(tokens ?? {}),
        fromResetLink: tokens !== null,
      });
      setPhase('done');
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-10 bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            パスワードの設定
          </h1>
          {email && (
            <p className="text-sm text-slate-600 mt-2 font-semibold">{email}</p>
          )}
          <p className="text-sm text-slate-500 mt-1">
            {MIN_LENGTH}文字以上で設定してください
          </p>
        </div>

        {phase === 'verifying' && <Spinner label="リンクを確認しています" />}

        {phase === 'invalid' && (
          <div className="space-y-6">
            <ErrorBanner message={invalidReason} />
            <Link href="/login" className="block">
              <Button variant="secondary" size="lg" fullWidth>
                ログイン画面へ
              </Button>
            </Link>
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-6">
            <SuccessBanner message="パスワードを設定しました。ログイン画面に移動します。" />
            <Link href="/login" className="block">
              <Button variant="secondary" size="lg" fullWidth>
                ログイン画面へ
              </Button>
            </Link>
          </div>
        )}

        {phase === 'ready' && (
          <form onSubmit={submit} className="space-y-4">
            <ErrorBanner message={error} />

            <Field label="パスワード" required>
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

            <Button type="submit" size="lg" fullWidth loading={saving}>
              このパスワードで設定する
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
