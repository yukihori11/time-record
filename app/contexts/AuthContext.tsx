'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { PayrollSettings, UserProfile } from '@/app/types/domain';
import { api } from '@/app/lib/client/fetcher';

interface MeResponse {
  user: UserProfile;
  currentWage: number | null;
  settings: PayrollSettings | null;
}

interface AuthContextValue {
  user: UserProfile | null;
  currentWage: number | null;
  settings: PayrollSettings | null;
  loading: boolean;
  isAdmin: boolean;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth は AuthProvider の内側で使ってください');
  }
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentWage, setCurrentWage] = useState<number | null>(null);
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const reload = useCallback(async () => {
    try {
      const data = await api.get<MeResponse>('/api/me');
      setUser(data.user);
      setCurrentWage(data.currentWage);
      setSettings(data.settings);
    } catch {
      setUser(null);
      setCurrentWage(null);
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const signOut = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
      router.push('/login');
      router.refresh();
    }
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        currentWage,
        settings,
        loading,
        isAdmin: user?.role === 'admin',
        reload,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
