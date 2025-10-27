// src/app/dashboard/page.tsx
'use client'; // <-- PASTIKAN ADA INI

import Link from 'next/link';
// VVV--- Impor React Hooks ---VVV
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
// VVV-------------------------VVV
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

/** ================== Types ================== */
type SimpleUser = { id: string; email?: string | null; name?: string | null; role: string; } | null;
type StoredUser = {
  email: string;
  name?: string;
  profile?: {
    location?: string;
    phone?: string;
    skills?: string; // CSV
    cv?: { name: string; type: string; key: string } | null;
    photo?: { name: string; type: string; key: string } | null;
  };
  createdAt?: string;
  updatedAt?: string;
};
type AcceptedItem = { jobId: string | number; title: string; date: string };

/** ================== Constants / Keys ================== */
const LS_USERS_KEY = 'ark_users';
const NAV_NAME_KEY_PREFIX = 'ark_nav_name:';
const LS_CV_DRAFTS = 'ark_cv_drafts';
const LS_APPS = 'ark_apps';
const LS_JOBS = 'ark_jobs';

/** ================== Minimal Icons ================== */
function ArrowRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-5 0-9 3-9 6v1h18v-1c0-3-4-6-9-6Z" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}
function BriefcaseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}
function DocumentIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M7 3h6l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2"/>
      <path d="M13 3v4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="m5 13 4 4 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/** ================== Skeleton kecil ================== */
function LineSkeleton({ w = '100%' }: { w?: string }) {
  return <div className="h-3 rounded bg-neutral-200 animate-pulse" style={{ width: w }} />;
}

/** ================== IndexedDB utils (opsional) ================== */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error("IndexedDB can only be accessed in the browser."));
      return;
    }
    const req = indexedDB.open('ark_db', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cv_files')) db.createObjectStore('cv_files');
      if (!db.objectStoreNames.contains('avatar_files')) db.createObjectStore('avatar_files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbHas(store: 'cv_files' | 'avatar_files', key: string): Promise<boolean> {
  try {
    const db = await openDB();
    const ok = await new Promise<boolean>((res) => {
      const tx = db.transaction(store, 'readonly');
      const r = tx.objectStore(store).getKey(key);
      r.onsuccess = () => res(!!r.result);
      r.onerror = () => { console.error(`IndexedDB getKey error in store ${store}:`, r.error); res(false); };
      tx.onerror = () => { console.error(`IndexedDB transaction error in store ${store}:`, tx.error); res(false); }
    });
    db.close();
    return ok;
  } catch(e) {
    console.error(`IndexedDB access error for store ${store}:`, e);
    return false;
  }
}

/** ================== Page Component ================== */
export default function Dashboard() {
  // VVV--- SEMUA HOOK HARUS DI ATAS SINI ---VVV
  const router = useRouter();
  const auth = useAuth();
  const { user, loading } = auth;
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const hasAttemptedRefresh = useRef(false);

  // State Hooks
  const [displayName, setDisplayName] = useState<string>('');
  const [hasCv, setHasCv] = useState<boolean>(false);
  const [hasCvDraft, setHasCvDraft] = useState<boolean>(false);
  const [skillsCount, setSkillsCount] = useState<number>(0);
  const [profileFilled, setProfileFilled] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [accepted, setAccepted] = useState<AcceptedItem[]>([]);

  // Memoized values/functions (useMemo, useCallback)
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: '2-digit' }),
    [locale]
  );

  const readUsersSafe = useCallback((): StoredUser[] => {
    try {
      if (typeof window === 'undefined') return [];
      return JSON.parse(localStorage.getItem(LS_USERS_KEY) ?? '[]') as StoredUser[];
    } catch { return []; }
  }, []);

  const readAcceptedApps = useCallback((email: string): AcceptedItem[] => {
    try {
       if (typeof window === 'undefined') return [];
      const appsRaw = localStorage.getItem(LS_APPS);
      const jobsRaw = localStorage.getItem(LS_JOBS);
      const appsByUser: any[] = JSON.parse(appsRaw ?? '{}')?.[email] ?? [];
      const jobs: any[] = JSON.parse(jobsRaw ?? '[]');
      const isAccepted = (a: any) => String(a?.status ?? '').toLowerCase() === 'hired';

      return appsByUser
        .filter(isAccepted)
        .map((a) => {
            const j = jobs.find((jj) => jj.id === a.jobId);
             return { jobId: a.jobId, title: j?.title ?? 'Unknown Job', date: a.updatedAt || a.createdAt || '' };
        })
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .slice(0, 5);
    } catch { return []; }
  }, []);

  const refreshProfileStats = useCallback(async (email: string) => {
    console.log("[refreshProfileStats] Refreshing for email:", email);
    const users = readUsersSafe();
    const u = users.find((x: StoredUser) => x.email === email);
    console.log("[refreshProfileStats] Found user data in localStorage:", u);

    const navName = typeof window !== 'undefined' ? localStorage.getItem(NAV_NAME_KEY_PREFIX + email) ?? '' : '';
    const nameFinal = (navName || u?.name || user?.name || '').trim();
    setDisplayName(nameFinal || t('fallback.there'));

    const skillsCsv = u?.profile?.skills ?? '';
    const skillsArr = skillsCsv.split(',').map((s: string) => s.trim()).filter(Boolean);
    setSkillsCount(skillsArr.length);

    const filled = Boolean(nameFinal) && Boolean(u?.profile?.location) && Boolean(u?.profile?.phone);
    setProfileFilled(filled);

    const metaKey = u?.profile?.cv?.key;
    let cvOk = false;
    if (metaKey) cvOk = await idbHas('cv_files', metaKey);
    setHasCv(cvOk);
    console.log(`[refreshProfileStats] CV Check (key: ${metaKey}):`, cvOk);

    try {
      if (typeof window !== 'undefined') {
          const allDrafts = JSON.parse(localStorage.getItem(LS_CV_DRAFTS) ?? '{}');
          setHasCvDraft(Boolean(allDrafts?.[email]));
          console.log("[refreshProfileStats] CV Draft Check:", Boolean(allDrafts?.[email]));
      }
    } catch { setHasCvDraft(false); }

    const acceptedApps = readAcceptedApps(email);
    setAccepted(acceptedApps);
    console.log("[refreshProfileStats] Accepted Apps:", acceptedApps);

    let score = 0;
    score += nameFinal ? 1 : 0;
    score += u?.profile?.location ? 1 : 0;
    score += u?.profile?.phone ? 1 : 0;
    score += cvOk || hasCvDraft ? 1 : 0;
    score += skillsArr.length >= 3 ? 1 : 0;
    const pct = Math.round((score / 5) * 100);
    setProgress(pct);
    console.log(`[refreshProfileStats] Progress: ${pct}% (Score: ${score}/5)`);

  }, [readUsersSafe, readAcceptedApps, t, user?.name]);

  // -------- Effect Utama untuk Proteksi Rute & Memuat Data --------
    useEffect(() => {
    console.log(`[Dashboard Effect] Running. Loading: ${loading}, User:`, user);

    (async () => {
      if (!loading) {
        if (!user) {
          if (!hasAttemptedRefresh.current) {
            console.log('[Dashboard Effect] No user after load, attempting auth.refresh()...');
            hasAttemptedRefresh.current = true;
            try {
              await auth.refresh(); // await supaya loading berubah sesuai
            } catch (e) {
              console.error('[Dashboard Effect] auth.refresh() failed:', e);
            }
            // refresh selesai — effect will re-run because auth.loading/user changed
            return;
          } else {
            console.log('[Dashboard Effect] Still no user after refresh attempt, redirecting to login.');
            router.replace('/auth/signin');
            return;
          }
        } else {
          // user exists
          hasAttemptedRefresh.current = false;
          console.log(`[Dashboard Effect] User authenticated (${user.email || user.username}). Checking role...`);
          if (user.role === 'admin' || user.role === 'employer') {
            console.warn(`[Dashboard Effect] Invalid role (${user.role}) for dashboard, redirecting to login.`);
            auth.signout().finally(() => { router.replace('/auth/signin'); });
            return;
          }
          if (user.email) {
            console.log(`[Dashboard Effect] User valid, refreshing profile stats for ${user.email}...`);
            refreshProfileStats(user.email);
            const onAnyUpdate = () => { if (user?.email) refreshProfileStats(user.email); };
            window.addEventListener('ark:profile-updated', onAnyUpdate);
            window.addEventListener('ark:avatar-updated', onAnyUpdate);
            window.addEventListener('storage', onAnyUpdate);
            return () => {
              window.removeEventListener('ark:profile-updated', onAnyUpdate);
              window.removeEventListener('ark:avatar-updated', onAnyUpdate);
              window.removeEventListener('storage', onAnyUpdate);
            };
          } else {
            console.warn("[Dashboard Effect] User authenticated but email is missing.");
          }
        }
      } else {
        console.log('[Dashboard Effect] Still loading session...');
        hasAttemptedRefresh.current = false;
      }
    })();
  }, [loading, user, router, t, auth, refreshProfileStats]);


  // Tampilkan loading skeleton jika loading ATAU jika user masih null SETELAH refresh dicoba
  if (loading || (!user && hasAttemptedRefresh.current)) {
    console.log("[Dashboard Render] Showing loading skeleton...");
    return (
      <div className="min-h-screen bg-neutral-50 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header Skeleton */}
          <div className="rounded-3xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 p-6 shadow-lg animate-pulse">
            <div className="space-y-3">
              <div className="h-4 w-32 rounded bg-neutral-700/70" />
              <div className="h-8 w-56 rounded bg-neutral-700/70" />
              <div className="h-4 w-72 rounded bg-neutral-700/60" />
            </div>
          </div>
          {/* Grid Skeleton */}
          <div className="mt-8 grid gap-6 md:grid-cols-2">
             <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm animate-pulse">
               <div className="mb-4 h-6 w-40 rounded bg-neutral-200" />
               <div className="space-y-2"><LineSkeleton /><LineSkeleton w="90%" /><LineSkeleton w="70%" /></div>
               <div className="mt-5 h-9 w-32 rounded-lg bg-neutral-200" />
             </div>
             <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm animate-pulse">
               <div className="mb-4 h-6 w-40 rounded bg-neutral-200" />
               <div className="space-y-3"><LineSkeleton /><LineSkeleton w="95%" /><LineSkeleton w="80%" /></div>
               <div className="mt-5 h-9 w-36 rounded-lg bg-neutral-200" />
             </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback jika user null setelah semua usaha (seharusnya tidak terjadi jika useEffect benar)
  if (!user) {
    console.error("[Dashboard Render] User is null after loading and refresh attempt.");
    return <div className="p-6">Verifying session... Please wait or try logging in again.</div>;
  }

  // Render konten dashboard normal HANYA jika loading selesai dan user ada
  console.log("[Dashboard Render] Rendering dashboard content for user:", user);
  return (
    <div className="min-h-screen bg-neutral-50 py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 shadow-lg">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div className="text-neutral-200">
                <p className="text-sm tracking-wide text-neutral-300">
                  {t('greetingSmall') || 'Welcome back,'}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {t('greeting', { name: displayName || user.name || t('fallback.there') })}
                </h1>
                <p className="mt-2 max-w-xl text-sm text-neutral-300">
                  {t('hero.subtitle') || 'Pantau profil dan kelola CV kamu di satu tempat.'}
                </p>
              </div>
              <div className="flex w-full gap-3 md:w-auto">
                <Link href="/jobs" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-100 md:flex-none">
                  <BriefcaseIcon className="h-4 w-4" /> {t('cta.findJobs') || 'Cari Lowongan'}
                </Link>
                <Link href="/profile" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/30 bg-transparent px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10 md:flex-none">
                  <UserIcon className="h-4 w-4" /> {t('profile.title') || 'Profil Saya'}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Content grid */}
        <section className="mt-8 grid gap-6 md:grid-cols-2">
          {/* Profile card */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-neutral-900">{t('profile.title')}</h3>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">{t('profile.badge') || 'Akun'}</span>
            </div>
            <p className="text-sm text-neutral-600">{t('profile.desc')}</p>
            <div className="mt-4"> {/* Progress */}
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-neutral-500">{t('profile.completeness') || 'Kelengkapan Profil'}</span>
                <span className="text-xs font-medium text-neutral-700">{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div className="h-2 rounded-full bg-neutral-900 transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="mt-5"> {/* CTA */}
              <Link href="/profile" className="group inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800">
                {t('profile.cta')} <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center"> {/* Stats */}
              <div className="rounded-2xl border border-neutral-200 p-3">
                <p className="text-xs text-neutral-500">{t('profile.stats.profile')}</p>
                <p className={`mt-1 text-lg font-semibold ${profileFilled ? 'text-green-600' : 'text-amber-600'}`}>
                  {profileFilled ? '✔︎' : 'Lengkapi'}
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 p-3">
                <p className="text-xs text-neutral-500">{t('profile.stats.skills')}</p>
                <p className="mt-1 text-lg font-semibold text-neutral-900">{skillsCount}</p>
              </div>
              <div className="rounded-2xl border border-neutral-200 p-3">
                <p className="text-xs text-neutral-500">CV</p>
                <p className={`mt-1 text-lg font-semibold ${hasCv || hasCvDraft ? 'text-green-600' : 'text-amber-600'}`}>
                  {hasCv || hasCvDraft ? 'Siap' : 'Belum'}
                </p>
              </div>
            </div>
          </div>

          {/* Panel Buat CV */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-neutral-900">Buat CV (ATS)</h3>
              <DocumentIcon className="h-5 w-5 text-neutral-400" />
            </div>
            <p className="text-sm text-neutral-600">Susun CV format ATS yang rapi dan siap kirim. Kamu bisa lanjutkan dari draft yang tersimpan otomatis.</p>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700">
                {hasCvDraft ? 'Draft ditemukan' : 'Belum ada draft'}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href="/cv" className="group inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800">
                {hasCvDraft ? 'Lanjutkan Draft' : 'Buat CV Sekarang'} <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>

          {/* Panel Lamaran Diterima */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm md:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-neutral-900">Lamaran Diterima</h3>
              <CheckIcon className="h-5 w-5 text-green-600" />
            </div>
            {accepted.length === 0 ? (
                 <div className="rounded-xl border border-dashed border-neutral-200 p-5 text-center">
                    <p className="text-sm text-neutral-600">Belum ada lamaran yang ditandai sebagai <span className="font-medium">diterima</span>.</p>
                    <Link href="/applications" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
                       Lihat Semua Lamaran <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                 </div>
             ) : (
                <>
                   <ul className="space-y-3">
                     {accepted.map((a, i) => {
                       const d = new Date(a.date);
                       const when = isNaN(d.getTime()) ? a.date : dateFmt.format(d);
                       return (
                         <li key={`${a.jobId}-${i}`} className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 p-3">
                           <div className="min-w-0">
                             <p className="truncate text-sm font-medium text-neutral-900">{a.title}</p>
                             <p className="mt-0.5 text-xs text-neutral-500">Diterima: {when}</p>
                           </div>
                           <Link href={`/jobs/${a.jobId}`} className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50">
                             Detail Pekerjaan <ArrowRightIcon className="h-3.5 w-3.5" />
                           </Link>
                         </li>
                       );
                     })}
                   </ul>
                   <div className="mt-5">
                     <Link href="/applications" className="group inline-flex items-center gap-2 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-200">
                       Lihat Semua Lamaran <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" />
                     </Link>
                   </div>
                 </>
             )}
          </div>
        </section>
      </div>
    </div>
  );
} // <-- Akhir fungsi Dashboard
