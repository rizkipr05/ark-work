'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Role = 'user' | 'admin' | 'employer';

export type EmployerLite = { id: string; slug?: string; displayName?: string | null };

export type UserLite = {
  id: string;
  email?: string;
  name?: string | null;
  photoUrl?: string | null;
  cvUrl?: string | null;
  role: Role;
  employer?: EmployerLite | null; // terisi saat role === 'employer'
};

export type AuthCtx = {
  user: UserLite | null;
  loading: boolean;

  // kandidat (user) atau admin
  signin: (identifier: string, password: string) => Promise<UserLite>;
  signup: (name: string, email: string, password: string) => Promise<UserLite>;

  // employer
  signinEmployer: (usernameOrEmail: string, password: string) => Promise<UserLite>;

  signout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserLite | null>(null);
  const [loading, setLoading] = useState(true);

  // ===== Restore session (urut: employer → user → admin) =====
  useEffect(() => {
    (async () => {
      try {
        // 1) employer
        try {
          const e: any = await api('/api/employers/auth/me');
          setUser({
            id: e?.admin?.id || 'unknown',
            email: e?.admin?.email,
            name: e?.admin?.fullName || e?.employer?.displayName || 'Employer',
            role: 'employer',
            employer: e?.employer
              ? { id: e.employer.id, slug: e.employer.slug, displayName: e.employer.displayName }
              : null,
          });
          return; // stop kalau employer ketemu
        } catch {}

        // 2) user (kandidat)
        try {
          const u: any = await api('/auth/me');
          setUser({
            id: u.id,
            email: u.email,
            name: u.name ?? null,
            photoUrl: u.photoUrl ?? null,
            cvUrl: u.cvUrl ?? null,
            role: 'user',
          });
          return;
        } catch {}

        // 3) admin
        try {
          const a: any = await api('/admin/me');
          setUser({
            id: a?.id || `admin:${a?.username || 'unknown'}`,
            email: `${a?.username || 'admin'}@local`,
            name: a?.username || 'Admin',
            role: 'admin',
          });
          return;
        } catch {}

        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ===== Signin (user / admin fallback) =====
  const signin: AuthCtx['signin'] = async (identifier, password) => {
    if (identifier.includes('@')) {
      try {
        const u: any = await api('/auth/signin', { json: { email: identifier, password } });
        const mapped: UserLite = { ...u, role: 'user' };
        setUser(mapped);
        return mapped;
      } catch {
        const a: any = await api('/admin/signin', { json: { usernameOrEmail: identifier, password } });
        const mapped: UserLite = {
          id: a?.admin?.id || `admin:${identifier}`,
          email: identifier,
          name: a?.admin?.username || 'Admin',
          role: 'admin',
        };
        setUser(mapped);
        return mapped;
      }
    }
    // tidak ada '@' → anggap admin
    const a: any = await api('/admin/signin', { json: { usernameOrEmail: identifier, password } });
    const mapped: UserLite = {
      id: a?.admin?.id || `admin:${identifier}`,
      email: `${identifier}@local`,
      name: a?.admin?.username || 'Admin',
      role: 'admin',
    };
    setUser(mapped);
    return mapped;
  };

  // ===== Employer signin =====
  const signinEmployer: AuthCtx['signinEmployer'] = async (usernameOrEmail, password) => {
    const resp: any = await api('/api/employers/auth/signin', {
      json: { usernameOrEmail, password },
    });
    const mapped: UserLite = {
      id: resp?.admin?.id || 'unknown',
      email: resp?.admin?.email,
      name: resp?.admin?.fullName || resp?.employer?.displayName || 'Employer',
      role: 'employer',
      employer: resp?.employer
        ? { id: resp.employer.id, slug: resp.employer.slug, displayName: resp.employer.displayName }
        : null,
    };
    setUser(mapped);
    return mapped;
  };

  // ===== Signup user (kandidat) =====
  const signup: AuthCtx['signup'] = async (name, email, password) => {
    const u: any = await api('/auth/signup', { json: { name, email, password } });
    const mapped: UserLite = { ...u, role: 'user' };
    setUser(mapped);
    return mapped;
  };

  // ===== Signout (bersihkan semua kemungkinan token) =====
  const signout = async () => {
    try { await api('/api/employers/auth/signout', { method: 'POST', expectJson: false }); } catch {}
    try { await api('/auth/signout', { method: 'POST', expectJson: false }); } catch {}
    try { await api('/admin/signout', { method: 'POST', expectJson: false }); } catch {}
    setUser(null);
  };

  const value = useMemo<AuthCtx>(
    () => ({ user, loading, signin, signup, signinEmployer, signout }),
    [user, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
