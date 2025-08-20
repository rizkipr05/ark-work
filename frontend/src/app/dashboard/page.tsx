'use client';

import {useEffect, useMemo, useState} from 'react';
import {useAuth} from '@/hooks/useAuth';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useLocale, useTranslations} from 'next-intl';

type SimpleUser = { email?: string | null; name?: string | null } | null;

type RecentItem = {
  jobId: string | number;
  title: string;
  date: string; // ISO/string dari localStorage
};

export default function Dashboard() {
  const router = useRouter();
  const {user, loading = false} = useAuth() as { user: SimpleUser; loading?: boolean };

  const t = useTranslations('dashboard');
  const locale = useLocale();

  const [recent, setRecent] = useState<RecentItem[]>([]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
      }),
    [locale]
  );

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/auth/signin');
      return;
    }

    try {
      const appsRaw = localStorage.getItem('ark_apps');
      const jobsRaw = localStorage.getItem('ark_jobs');

      const apps = JSON.parse(appsRaw ?? '{}');
      const jobs: any[] = JSON.parse(jobsRaw ?? '[]');

      const userKey = user?.email ?? '';
      const arr: RecentItem[] = (apps[userKey] ?? [])
        .slice(-3)
        .map((a: any) => {
          const j = jobs.find((jj) => jj.id === a.jobId);
          return {
            jobId: a.jobId,
            title: j?.title ?? `${t('fallback.job')} ${a.jobId}`,
            date: a.date ?? new Date().toISOString()
          };
        });

      setRecent(arr.reverse()); // paling baru di atas
    } catch (e) {
      console.error('Failed to parse localStorage:', e);
      setRecent([]);
    }
  }, [loading, user, router, t]);

  if (loading || !user) return null;

  const displayName = user?.name?.trim() || t('fallback.there');

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-3xl font-bold text-brand-blue">
          {t('greeting', {name: displayName})}
        </h1>

        {/* Cards */}
        <div className="flex justify-center">
          <div className="grid gap-6 md:grid-cols-2">
            {/* My Profile */}
            <div className="rounded-lg border border-gray-300 bg-white p-6 shadow-lg">
              <h3 className="mb-4 text-xl font-semibold">{t('profile.title')}</h3>
              <p className="mb-4 text-gray-600">{t('profile.desc')}</p>
              <Link
                href="/profile"
                className="block rounded-lg bg-brand-yellow py-2 text-center text-black transition-colors hover:bg-yellow-600 hover:text-white"
              >
                {t('profile.cta')}
              </Link>
            </div>

            {/* Recent Activity */}
            <div className="rounded-lg border border-gray-300 bg-white p-6 shadow-lg">
              <h3 className="mb-4 text-xl font-semibold">{t('recent.title')}</h3>
              <div className="space-y-2">
                {recent.length === 0 ? (
                  <p className="text-gray-600">{t('recent.empty')}</p>
                ) : (
                  recent.map((r, i) => {
                    const d = new Date(r.date);
                    const when = isNaN(d.getTime()) ? r.date : dateFmt.format(d);
                    return (
                      <p key={i} className="text-sm text-gray-600">
                        {t('recent.item', {title: r.title, date: when})}
                      </p>
                    );
                  })
                )}
              </div>
              <Link
                href="/applications"
                className="mt-4 block rounded-lg bg-brand-yellow py-2 text-center text-black transition-colors hover:bg-yellow-600 hover:text-white"
              >
                {t('recent.viewAll')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
