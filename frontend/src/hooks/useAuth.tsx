// frontend/src/hooks/useAuth.tsx
'use client';

import {createContext, useContext, useEffect, useMemo, useState} from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Role = 'admin' | 'user';

export type UserLite = {
  id: string;
  email: string;
  name?: string | null;
  photoUrl?: string | null;
  cvUrl?: string | null;
  role?: Role;
};

export type SignupCompanyPayload = {
  companyName: string;
  email: string;
  password: string;
  website?: string;
};

export type AuthCtx = {
  user: UserLite | null;
  loading: boolean;

  // identifier boleh email (user) atau username (admin)
  signin: (identifier: string, password: string) => Promise<UserLite>;
  signup: (name: string, email: string, password: string) => Promise<UserLite>;
  signout: () => Promise<void>;

  // opsional: untuk halaman signup perusahaan
  signupCompany?: (payload: SignupCompanyPayload) => Promise<void>;

  // opsional: kalau nanti butuh social login
  social?: (provider: 'google', intent?: 'signin' | 'signup') => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as any);

async function api(path: string, init?: RequestInit & { json?: any }) {
  const res = await fetch(`${API}${path}`, {
    method: init?.method || (init?.json ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    credentials: 'include',
    body: init?.json ? JSON.stringify(init.json) : undefined,
  });
  if (!res.ok) {
    let msg = 'Request failed';
    try {
      const j = await res.json();
      msg = j?.message || j?.error || msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null as any;
  return res.json();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserLite | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session: coba user dulu, kalau gagal coba admin
  useEffect(() => {
    (async () => {
      try {
        const me: UserLite = await api('/auth/me');
        setUser(me);
      } catch {
        try {
          const adm = await api('/admin/me'); // sebaiknya backend sediakan endpoint ini
          // Normalisasi admin ke bentuk UserLite
          const mapped: UserLite = {
            id: adm?.id || `admin:${adm?.username || 'unknown'}`,
            email: adm?.email || `${adm?.username || 'admin'}@local`,
            name: adm?.username || 'Admin',
            role: 'admin',
          };
          setUser(mapped);
        } catch {
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Login: kalau identifier ada '@' anggap email → /auth/signin
  // kalau tidak, anggap username admin → /admin/signin
  const signin: AuthCtx['signin'] = async (identifier, password) => {
    if (identifier.includes('@')) {
      const u: UserLite = await api('/auth/signin', { json: { email: identifier, password } });
      setUser(u);
      return u;
    } else {
      const a = await api('/admin/signin', { json: { username: identifier, password } });
      const mapped: UserLite = {
        id: a?.id || `admin:${a?.username || identifier}`,
        email: a?.email || `${a?.username || identifier}@local`,
        name: a?.username || 'Admin',
        role: 'admin',
      };
      setUser(mapped);
      return mapped;
    }
  };

  const signup: AuthCtx['signup'] = async (name, email, password) => {
    const u: UserLite = await api('/auth/signup', { json: { name, email, password } });
    setUser(u);
    return u;
  };

  // Opsional: endpoint perusahaan; kalau belum ada, ubah sesuai backend kamu
  const signupCompany: AuthCtx['signupCompany'] = async (payload) => {
    await api('/companies/signup', { json: payload });
    // biasanya tidak auto-login; biarkan user tetap null atau lakukan fetch /auth/me kalau backend auto-login
  };

  const signout = async () => {
    // coba keduanya; abaikan kalau error
    try { await api('/auth/signout', { method: 'POST' }); } catch {}
    try { await api('/admin/signout', { method: 'POST' }); } catch {}
    setUser(null);
  };

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      signin,
      signup,
      signout,
      signupCompany, // opsional, tapi disediakan agar TS tidak error di signup_perusahaan
      // social: undefined, // siapkan kalau nanti dipakai
    }),
    [user, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
