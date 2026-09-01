import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser, loginUser } from '../../lib/api.js';

export interface AuthUser {
  id: string;
  full_name: string;
  name: string;
  email: string | null;
  phone?: string;
  role: 'user' | 'admin';
  balance: number;
  auth_provider?: 'local' | 'google' | 'github';
  profile_picture?: string | null;
  email_verified?: boolean;
  account_status?: string;
  wallet_balance?: number;
  created_at?: string | null;
  last_login?: string | null;
}

interface LoginResult {
  success: boolean;
  error?: string;
  requiresVerification?: boolean;
  email?: string;
  role?: 'user' | 'admin';
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  completeTokenLogin: (token: string) => Promise<LoginResult>;
  logout: () => void;
  updateBalance: (newBalance: number) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = 'viresend_token';
const USER_KEY = 'viresend_user';

function readStoredAuth(): { token: string | null; user: AuthUser | null } {
  const storedToken = localStorage.getItem(TOKEN_KEY);
  const storedUser = localStorage.getItem(USER_KEY);

  if (!storedToken || !storedUser) {
    return { token: null, user: null };
  }

  try {
    return { token: storedToken, user: JSON.parse(storedUser) };
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('viresend_ai_conversation_id');
    return { token: null, user: null };
  }
}

function normalizeUser(user: any): AuthUser {
  return {
    id: user.id,
    full_name: user.full_name || user.name || '',
    name: user.full_name || user.name || '',
    email: user.email ?? null,
    phone: user.phone || '',
    role: user.role,
    balance: user.balance ?? user.wallet_balance ?? 0,
    auth_provider: user.auth_provider || 'local',
    profile_picture: user.profile_picture || null,
    email_verified: user.email_verified,
    account_status: user.account_status,
    wallet_balance: user.wallet_balance ?? user.balance ?? 0,
    created_at: user.created_at || null,
    last_login: user.last_login || null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const storedAuth = readStoredAuth();
  const [user, setUser] = useState<AuthUser | null>(storedAuth.user);
  const [token, setToken] = useState<string | null>(storedAuth.token);

  useEffect(() => {
    const latestAuth = readStoredAuth();
    if (latestAuth.token && latestAuth.user) {
      setToken(latestAuth.token);
      setUser(latestAuth.user);
    }
  }, []);

  const login = async (identifier: string, password: string): Promise<LoginResult> => {
    try {
      const email = identifier.trim();
      const response = await loginUser({ email, identifier: email, password });
      const authUser = normalizeUser(response.user);

      setToken(response.token);
      setUser(authUser);
      localStorage.setItem(TOKEN_KEY, response.token);
      localStorage.setItem(USER_KEY, JSON.stringify(authUser));

      return { success: true, role: authUser.role };
    } catch (error: any) {
      const data = error?.data || {};
      return {
        success: false,
        error: data.message || error?.message || 'Invalid email/username or password.',
        requiresVerification: !!data.requires_verification,
        email: data.email,
      };
    }
  };

  const completeTokenLogin = async (tokenValue: string): Promise<LoginResult> => {
    try {
      const response = await getCurrentUser(tokenValue);
      const authUser = normalizeUser(response.user);

      setToken(tokenValue);
      setUser(authUser);
      localStorage.setItem(TOKEN_KEY, tokenValue);
      localStorage.setItem(USER_KEY, JSON.stringify(authUser));

      return { success: true, role: authUser.role };
    } catch (error: any) {
      return {
        success: false,
        error: error?.data?.message || error?.message || 'Google authentication failed.',
      };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('viresend_ai_active_conversation:'))
      .forEach((key) => sessionStorage.removeItem(key));
  };

  const updateBalance = (newBalance: number) => {
    if (user) {
      const updated = { ...user, balance: newBalance, wallet_balance: newBalance };
      setUser(updated);
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, completeTokenLogin, logout, updateBalance, isAuthenticated: !!token && !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
