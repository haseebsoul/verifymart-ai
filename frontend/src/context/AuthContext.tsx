import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AtlasRole, PublicUser } from '@verifymart/shared';
import { api, setAccessToken } from '../lib/api';

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role: AtlasRole;
  businessName?: string;
  country?: string;
  inviteKey?: string;
};

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  demoMode: boolean;
  login: (email: string, password: string, selectedRole: AtlasRole) => Promise<PublicUser>;
  register: (input: RegisterInput) => Promise<PublicUser>;
  demoLogin: (role: AtlasRole) => Promise<PublicUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthResponse = { user: PublicUser; accessToken?: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const apply = (data: AuthResponse) => {
    setUser(data.user);
    if (data.accessToken) setAccessToken(data.accessToken);
    return data.user;
  };

  const refreshUser = useCallback(async () => {
    try {
      const result = await api<AuthResponse>('/auth/refresh', { method: 'POST' });
      apply(result);
    } catch {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      api<{ demoMode: boolean }>('/auth/mode')
        .then(result => setDemoMode(result.demoMode))
        .catch(() => setDemoMode(false)),
      refreshUser()
    ]).finally(() => setLoading(false));
  }, [refreshUser]);

  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void refreshUser();
    };
    const interval = window.setInterval(refresh, 10 * 60 * 1000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [user?.id, refreshUser]);

  const login = async (email: string, password: string, selectedRole: AtlasRole) => {
    const result = await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, selectedRole })
    });
    return apply(result);
  };

  const register = async (input: RegisterInput) => {
    const result = await api<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return apply(result);
  };

  const demoLogin = async (role: AtlasRole) => {
    const result = await api<AuthResponse>('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ role })
    });
    return apply(result);
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  };

  const value = useMemo(
    () => ({ user, loading, demoMode, login, register, demoLogin, logout, refreshUser }),
    [user, loading, demoMode, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
