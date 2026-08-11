'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import Button from '@/app/components/ui/Button';
import { Field, Input } from '@/app/components/ui/Field';
import { ErrorBanner, SuccessBanner } from '@/app/components/ui/Feedback';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.post('/api/auth/forgot-password', { email });
      setSent(true);
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
          <h1 className="text-2xl font-bold text-slate-900">パスワード再設定</h1>
          <p className="text-sm text-slate-500 mt-2">
            登録済みのメールアドレスに再設定用のリンクを送ります
          </p>
        </div>

        {sent ? (
          <div className="space-y-6">
            <SuccessBanner message="パスワード再設定用のメールを送信しました。メールをご確認ください。" />
            <p className="text-sm text-slate-500 text-center">
              メールが届かない場合は迷惑メールフォルダをご確認ください。
            </p>
            <Link href="/login" className="block">
              <Button variant="secondary" size="lg" fullWidth>
                ログイン画面に戻る
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <ErrorBanner message={error} />

            <Field label="メールアドレス" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
              />
            </Field>

            <Button type="submit" size="lg" fullWidth loading={loading}>
              再設定メールを送る
            </Button>

            <Link href="/login" className="block">
              <Button type="button" variant="ghost" size="md" fullWidth>
                ログイン画面に戻る
              </Button>
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
