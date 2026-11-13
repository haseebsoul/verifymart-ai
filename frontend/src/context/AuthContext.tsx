import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setAccessToken } from '../lib/api';
import type { PublicUser, Role } from '@verifymart/shared';

interface RegisterOptions {
  role?: Role | undefined;
  country?: string | undefined;
  businessName?: string | undefined;
  businessDescription?: string | undefined;
  invitationCode?: string | undefined;
}

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  demoMode: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, options?: RegisterOptions) => Promise<{ requiresApproval?: boolean | undefined }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const apply = (data: { user: PublicUser; accessToken?: string }) => {
    setUser(data.user);
    if (data.accessToken) setAccessToken(data.accessToken);
  };

  const refreshUser = async () => {
    try {
      const result = await api<{ user: PublicUser; accessToken?: string }>('/auth/refresh', { method: 'POST' });
      apply(result);
    } catch {
      setUser(null);
      setAccessToken(null);
    }
  };

  useEffect(() => {
    void Promise.all([
      api<{ demoMode: boolean }>('/auth/mode').then(r => setDemoMode(r.demoMode)).catch(() => setDemoMode(false)),
      refreshUser()
    ]).finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api<{ user: PublicUser; accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    apply(result);
  };

  const register = async (name: string, email: string, password: string, options?: RegisterOptions) => {
    const result = await api<{ user: PublicUser; accessToken: string; requiresApproval?: boolean }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, ...options })
    });
    apply(result);
    return { requiresApproval: result.requiresApproval };
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  };

  const value = useMemo(() => ({ user, loading, demoMode, login, register, logout, refreshUser }), [user, loading, demoMode]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
