'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { useAuth } from '@/app/contexts/AuthContext';
import Button from '@/app/components/ui/Button';
import { Field, Input } from '@/app/components/ui/Field';
import { ErrorBanner } from '@/app/components/ui/Feedback';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { reload } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.post('/api/auth/login', { email, password });

      // AuthProvider は起動時に1回しか /api/me を呼ばない。
      // ログイン画面を開いた時点では未認証なので user は null のままで、
      // 画面遷移しても再マウントされないため読み込み中から進まなくなる。
      // ここで取り直してから移動する。
      await reload();

      const redirect = searchParams.get('redirect');
      router.replace(redirect && redirect.startsWith('/') ? redirect : '/');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-10 bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">民泊 勤怠管理</h1>
          <p className="text-sm text-slate-500 mt-2">ログインしてください</p>
        </div>

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

          <Field label="パスワード" required>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </Field>

          <Button type="submit" size="lg" fullWidth loading={loading}>
            ログイン
          </Button>
        </form>

        {/*
          パスワードの再設定はメールを使わない。
          管理者が設定画面から再発行して本人に伝える運用。
        */}
        <p className="text-center text-sm text-slate-500 mt-6 leading-relaxed">
          パスワードが分からない場合は
          <br />
          管理者にお問い合わせください
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
