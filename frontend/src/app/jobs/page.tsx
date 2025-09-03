'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

/* ---------------- Server base (dukung 2 var + fallback dev) ---------------- */
const API =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

/* ---------------- Types ---------------- */
type JobDTO = {
  id: string;
  title: string;
  location: string;
  employment: string;
  description: string;
  postedAt: string; // ISO
  company: string;
  logoUrl: string | null;
  isActive: boolean;
  // opsional
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  requirements?: string | null;
};

type Job = {
  id: string | number;
  title: string;
  location: string;
  industry: 'Oil & Gas' | 'Renewable Energy' | 'Mining';
  contract: 'Full-time' | 'Contract' | 'Part-time';
  function: 'Engineering' | 'Operations' | 'Management';
  remote: 'On-site' | 'Remote' | 'Hybrid';
  posted: string; // YYYY-MM-DD
  description: string;
  company?: string;
  logo?: string | null; // data URL atau URL
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  requirements?: string | null;
};

const LS_KEY = 'ark_jobs';

type LocalJob = {
  id: string | number;
  title: string;
  company: string;
  location: string;
  type: 'full_time' | 'part_time' | 'contract' | 'internship';
  remote?: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string;
  deadline?: string | null;
  tags?: string[];
  description?: string;
  requirements?: string | null;
  postedAt?: string; // ISO
  status?: 'active' | 'closed';
  logo?: string | null; // data URL
};

/* ---------- Helpers & Normalizer ---------- */
function guessIndustry(tags?: string[]): Job['industry'] {
  const t = (tags ?? []).map((s) => s.toLowerCase());
  if (t.some((x) => /renewable|solar|wind|pv|geothermal|hydro/.test(x))) return 'Renewable Energy';
  if (t.some((x) => /mining|mine|coal|nickel|mineral/.test(x))) return 'Mining';
  return 'Oil & Gas';
}
function mapContractFromLocal(t: LocalJob['type']): Job['contract'] {
  switch (t) {
    case 'part_time':
      return 'Part-time';
    case 'contract':
      return 'Contract';
    default:
      return 'Full-time';
  }
}
function mapFunctionFromTextLocal(j: LocalJob): Job['function'] {
  const txt = `${j.title} ${j.description ?? ''}`.toLowerCase();
  if (/(manager|lead|head|director|pm)/.test(txt)) return 'Management';
  if (/(operator|technician|maintenance|operations)/.test(txt)) return 'Operations';
  return 'Engineering';
}
function mapRemoteLocal(r?: boolean): Job['remote'] {
  return r ? 'Remote' : 'On-site';
}
function isoToYmd(iso?: string): string {
  try {
    const d = iso ? new Date(iso) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return iso || '';
  }
}
function normalizeLocal(ls: LocalJob[]): Job[] {
  return ls
    .filter((j) => (j.status ?? 'active') === 'active')
    .map((j, idx) => ({
      id: j.id ?? Date.now() + idx,
      title: j.title,
      company: j.company,
      location: j.location || 'Indonesia',
      industry: guessIndustry(j.tags),
      contract: mapContractFromLocal(j.type),
      function: mapFunctionFromTextLocal(j),
      remote: mapRemoteLocal(j.remote),
      posted: isoToYmd(j.postedAt),
      description: j.description || '',
      logo: j.logo ?? null,
      salaryMin: j.salaryMin ?? null,
      salaryMax: j.salaryMax ?? null,
      currency: j.currency ?? 'IDR',
      requirements: j.requirements ?? null,
    }));
}

/* ---------- Normalizer dari server DTO ---------- */
function mapContractFromServer(e: string): Job['contract'] {
  const v = (e || '').toLowerCase();
  if (v.includes('part')) return 'Part-time';
  if (v.includes('contract')) return 'Contract';
  return 'Full-time';
}
function mapFunctionFromTextServer(j: JobDTO): Job['function'] {
  const txt = `${j.title} ${j.description ?? ''}`.toLowerCase();
  if (/(manager|lead|head|director|pm)/.test(txt)) return 'Management';
  if (/(operator|technician|maintenance|operations)/.test(txt)) return 'Operations';
  return 'Engineering';
}
function mapRemoteFromServer(location: string): Job['remote'] {
  const lc = (location || '').toLowerCase();
  if (lc.includes('remote')) return 'Remote';
  if (lc.includes('hybrid')) return 'Hybrid';
  return 'On-site';
}
function normalizeServer(arr: JobDTO[]): Job[] {
  return (arr || [])
    .filter((j) => j.isActive !== false)
    .map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location || 'Indonesia',
      industry: 'Oil & Gas',
      contract: mapContractFromServer(j.employment),
      function: mapFunctionFromTextServer(j),
      remote: mapRemoteFromServer(j.location),
      posted: isoToYmd(j.postedAt),
      description: j.description || '',
      logo: j.logoUrl || null,
      salaryMin: j.salaryMin ?? null,
      salaryMax: j.salaryMax ?? null,
      currency: j.currency ?? null,
      requirements: j.requirements ?? null,
    }));
}

/* ------------ Formatters ------------ */
function formatMoney(n?: number | null, curr: string = 'IDR') {
  if (n == null) return '';
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: curr }).format(n);
  } catch {
    return `${curr} ${n.toLocaleString('id-ID')}`;
  }
}
function formatSalary(min?: number | null, max?: number | null, curr?: string | null) {
  if (min == null && max == null) return '';
  const c = curr || 'IDR';
  if (min != null && max != null) return `${formatMoney(min, c)} – ${formatMoney(max, c)}`;
  if (min != null) return `≥ ${formatMoney(min, c)}`;
  return `≤ ${formatMoney(max!, c)}`;
}

/* ---------------- Page ---------------- */
export default function JobsPage() {
  const t = useTranslations('jobs');
  const locale = useLocale();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [filters, setFilters] = useState({
    q: '',
    loc: '',
    industry: '',
    contract: '',
    func: '',
    remote: '',
  });
  const [saved, setSaved] = useState<Array<string | number>>([]);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [drawer, setDrawer] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Modal detail state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<Job | null>(null);

  // baca localStorage jobs
  const readLocal = (): LocalJob[] => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
    } catch {
      return [];
    }
  };

  const refreshFromLocal = () => {
    const ls = readLocal();
    const normalized = normalizeLocal(ls);
    const sorted = normalized.sort((a, b) =>
      sort === 'newest'
        ? new Date(b.posted).getTime() - new Date(a.posted).getTime()
        : new Date(a.posted).getTime() - new Date(b.posted).getTime()
    );
    setJobs(sorted);
  };

  // load dari server dlu, kalau kosong/gagal => fallback local
  useEffect(() => {
    (async () => {
      try {
        setLoadErr(null);
        const base = API.replace(/\/+$/, '');

        // 1) publik
        const r1 = await fetch(`${base}/api/jobs?active=1`, { credentials: 'include' });
        if (r1.ok) {
          const j1 = await r1.json().catch(() => null);
          const serverList: JobDTO[] = Array.isArray(j1?.data) ? j1.data : [];
          const mapped = normalizeServer(serverList);
          if (mapped.length > 0) {
            const sorted = mapped.sort((a, b) =>
              sort === 'newest'
                ? new Date(b.posted).getTime() - new Date(a.posted).getTime()
                : new Date(a.posted).getTime() - new Date(b.posted).getTime()
            );
            setJobs(sorted);
            return;
          }
        }

        // 2) fallback: job milik employer (dev / logged-in)
        const eid = localStorage.getItem('ark_employer_id');
        if (eid) {
          const r2 = await fetch(`${base}/api/employer/jobs?employerId=${encodeURIComponent(eid)}`, {
            credentials: 'include',
          });
          if (r2.ok) {
            const j2 = await r2.json().catch(() => null);
            const serverList2: JobDTO[] = Array.isArray(j2?.data) ? j2.data : [];
            const mapped2 = normalizeServer(serverList2);
            if (mapped2.length > 0) {
              const sorted = mapped2.sort((a, b) =>
                sort === 'newest'
                  ? new Date(b.posted).getTime() - new Date(a.posted).getTime()
                  : new Date(a.posted).getTime() - new Date(b.posted).getTime()
              );
              setJobs(sorted);
              return;
            }
          }
        }

        // 3) local fallback
        refreshFromLocal();
      } catch (e: any) {
        console.error('[JobsPage] load error:', e);
        setLoadErr(e?.message || 'Gagal memuat data');
        refreshFromLocal();
      }
    })();

    // saved jobs
    try {
      setSaved(JSON.parse(localStorage.getItem('ark_saved_global') ?? '[]'));
    } catch {}

    // live refresh setelah posting dari form
    const onUpd = () => refreshFromLocal();
    window.addEventListener('ark:jobs-updated', onUpd);
    return () => window.removeEventListener('ark:jobs-updated', onUpd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: '2-digit' }),
    [locale]
  );

  const items = useMemo(() => {
    const k = filters.q.toLowerCase();
    const loc = filters.loc.toLowerCase();

    const arr = jobs.filter(
      (j) =>
        (k === '' || j.title.toLowerCase().includes(k) || (j.company || '').toLowerCase().includes(k)) &&
        (loc === '' || j.location.toLowerCase().includes(loc)) &&
        (filters.industry === '' || j.industry === filters.industry) &&
        (filters.contract === '' || j.contract === filters.contract) &&
        (filters.func === '' || j.function === filters.func) &&
        (filters.remote === '' || j.remote === filters.remote)
    );

    arr.sort((a, b) =>
      sort === 'newest'
        ? new Date(b.posted).getTime() - new Date(a.posted).getTime()
        : new Date(a.posted).getTime() - new Date(b.posted).getTime()
    );

    return arr;
  }, [jobs, filters, sort]);

  const toggleSave = (id: string | number) => {
    const next = saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id];
    setSaved(next);
    localStorage.setItem('ark_saved_global', JSON.stringify(next));
  };
  const clearFilters = () =>
    setFilters({ q: '', loc: '', industry: '', contract: '', func: '', remote: '' });

  const formatPosted = (ymd: string) => {
    const d = new Date(ymd);
    return isNaN(d.getTime()) ? ymd : dateFmt.format(d);
  };

  function openDetail(job: Job) {
    setDetailJob(job);
    setDetailOpen(true);
  }

  function applySelected(sel: Job | null) {
    if (!sel) return;
    const cur = localStorage.getItem('ark_current');
    if (!cur) {
      alert('Silakan login terlebih dahulu untuk melamar.');
      return;
    }
    const apps = JSON.parse(localStorage.getItem('ark_apps') ?? '{}');
    const arr = apps[cur] ?? [];
    if (arr.find((a: any) => a.jobId === sel.id)) {
      alert('Anda sudah melamar lowongan ini.');
      return;
    }
    arr.push({ jobId: sel.id, date: new Date().toISOString().split('T')[0] });
    apps[cur] = arr;
    localStorage.setItem('ark_apps', JSON.stringify(apps));
    setDetailOpen(false);
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-neutral-900">{t('heading')}</h1>
              <p className="text-neutral-600">{t('subheading')}</p>
              {loadErr && (
                <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {loadErr}
                </div>
              )}
            </div>

            {/* Search + Sort + Mobile filter */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <input
                  value={filters.q}
                  onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))}
                  placeholder={t('search.placeholder')}
                  className="w-full sm:w-80 rounded-xl border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-neutral-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600">{t('sort.label')}</label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="newest">{t('sort.newest')}</option>
                  <option value="oldest">{t('sort.oldest')}</option>
                </select>
              </div>

              <button
                onClick={() => setDrawer(true)}
                className="sm:hidden inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <FilterIcon className="h-4 w-4" /> {t('filters.title')}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-8 grid lg:grid-cols-12 gap-6">
        {/* Sidebar filters (desktop) */}
        <aside className="hidden lg:col-span-3 lg:block">
          <FilterCard>
            <FilterInput
              label={t('filters.location')}
              value={filters.loc}
              onChange={(v) => setFilters((s) => ({ ...s, loc: v }))}
              icon={<PinIcon className="h-4 w-4" />}
            />
            <FilterSelect
              label={t('filters.industry')}
              value={filters.industry}
              onChange={(v) => setFilters((s) => ({ ...s, industry: v }))}
              options={['', 'Oil & Gas', 'Renewable Energy', 'Mining']}
              icon={<LayersIcon className="h-4 w-4" />}
            />
            <FilterSelect
              label={t('filters.contract')}
              value={filters.contract}
              onChange={(v) => setFilters((s) => ({ ...s, contract: v }))}
              options={['', 'Full-time', 'Contract', 'Part-time']}
              icon={<BriefcaseIcon className="h-4 w-4" />}
            />
            <FilterSelect
              label={t('filters.function')}
              value={filters.func}
              onChange={(v) => setFilters((s) => ({ ...s, func: v }))}
              options={['', 'Engineering', 'Operations', 'Management']}
              icon={<CogIcon className="h-4 w-4" />}
            />
            <FilterSelect
              label={t('filters.workmode')}
              value={filters.remote}
              onChange={(v) => setFilters((s) => ({ ...s, remote: v }))}
              options={['', 'On-site', 'Remote', 'Hybrid']}
              icon={<GlobeIcon className="h-4 w-4" />}
            />

            <div className="pt-3 flex items-center justify-between">
              <span className="text-sm text-neutral-500">
                {t('filters.results', { count: items.length })}
              </span>
              <button onClick={clearFilters} className="text-sm text-blue-700 hover:underline">
                {t('filters.clear')}
              </button>
            </div>
          </FilterCard>
        </aside>

        {/* List */}
        <section className="lg:col-span-9 space-y-4">
          {items.length === 0 ? (
            <EmptyState t={t} />
          ) : (
            items.map((job) => (
              <article
                key={job.id}
                onClick={() => openDetail(job)}
                className="group cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition"
              >
                <div className="flex gap-4">
                  <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 via-blue-500 to-amber-400 grid place-items-center overflow-hidden text-white text-sm font-bold">
                    {job.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={job.company || 'logo'} src={job.logo} className="h-full w-full object-cover" />
                    ) : (
                      initials(job.company || 'AW')
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base md:text-lg font-semibold text-neutral-900">
                          {job.title}
                        </h3>
                        <p className="text-sm text-neutral-600 truncate">{job.company || t('common.company')}</p>
                      </div>
                      <span className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
                        {t('common.view')}
                      </span>
                    </div>

                    {/* meta row */}
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[13px]">
                      <Meta icon={<PinIcon className="h-4 w-4" />} text={job.location} />
                      <Meta icon={<BriefcaseIcon className="h-4 w-4" />} text={job.contract} />
                      <Meta icon={<LayersIcon className="h-4 w-4" />} text={job.industry} />
                      <Meta icon={<GlobeIcon className="h-4 w-4" />} text={job.remote} />
                      {job.salaryMin != null || job.salaryMax != null ? (
                        <Meta icon={<MoneyIcon className="h-4 w-4" />} text={formatSalary(job.salaryMin, job.salaryMax, job.currency)} />
                      ) : null}
                    </div>

                    <p className="mt-3 line-clamp-2 text-sm text-neutral-600">{job.description}</p>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-neutral-500">
                        {t('common.posted', { date: formatPosted(job.posted) })}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSave(job.id);
                        }}
                        className={[
                          'rounded-lg border px-2.5 py-1 text-xs transition',
                          saved.includes(job.id)
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50',
                        ].join(' ')}
                      >
                        {saved.includes(job.id) ? t('common.saved') : t('common.save')}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>

      {/* Drawer (mobile filters) */}
      {drawer && (
        <Drawer onClose={() => setDrawer(false)} title={t('filters.title')}>
          <div className="space-y-3">
            <FilterInput
              label={t('filters.location')}
              value={filters.loc}
              onChange={(v) => setFilters((s) => ({ ...s, loc: v }))}
              icon={<PinIcon className="h-4 w-4" />}
            />
            <FilterSelect
              label={t('filters.industry')}
              value={filters.industry}
              onChange={(v) => setFilters((s) => ({ ...s, industry: v }))}
              options={['', 'Oil & Gas', 'Renewable Energy', 'Mining']}
              icon={<LayersIcon className="h-4 w-4" />}
            />
            <FilterSelect
              label={t('filters.contract')}
              value={filters.contract}
              onChange={(v) => setFilters((s) => ({ ...s, contract: v }))}
              options={['', 'Full-time', 'Contract', 'Part-time']}
              icon={<BriefcaseIcon className="h-4 w-4" />}
            />
            <FilterSelect
              label={t('filters.function')}
              value={filters.func}
              onChange={(v) => setFilters((s) => ({ ...s, func: v }))}
              options={['', 'Engineering', 'Operations', 'Management']}
              icon={<CogIcon className="h-4 w-4" />}
            />
            <FilterSelect
              label={t('filters.workmode')}
              value={filters.remote}
              onChange={(v) => setFilters((s) => ({ ...s, remote: v }))}
              options={['', 'On-site', 'Remote', 'Hybrid']}
              icon={<GlobeIcon className="h-4 w-4" />}
            />
            <div className="pt-2 flex items-center justify-between">
              <span className="text-sm text-neutral-500">
                {t('filters.results', { count: items.length })}
              </span>
              <button onClick={clearFilters} className="text-sm text-blue-700 hover:underline">
                {t('filters.clear')}
              </button>
            </div>
          </div>
        </Drawer>
      )}

      {/* Detail Modal (besar, logo perusahaan di header) */}
      {detailOpen && detailJob && (
        <DetailModal
          job={detailJob}
          onClose={() => setDetailOpen(false)}
          onApply={() => applySelected(detailJob)}
          postedText={formatPosted(detailJob.posted)}
        />
      )}
    </div>
  );
}

/* ---------------- UI helpers ---------------- */
function FilterCard({ children }: { children: React.ReactNode }) {
  const t = useTranslations('jobs');
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 sticky top-24">
      <div className="mb-2 text-sm font-semibold text-neutral-900">{t('filters.title')}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function FilterInput({
  label,
  value,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: React.ReactNode;
}) {
  const t = useTranslations('jobs');
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">{icon}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-neutral-400"
          placeholder={t('filters.placeholder', { label: label.toLowerCase() })}
        />
      </div>
    </label>
  );
}
function FilterSelect({
  label,
  value,
  onChange,
  options,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  icon?: React.ReactNode;
}) {
  const t = useTranslations('jobs');
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">{icon}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          {options.map((o) => (
            <option key={o || 'all'} value={o}>
              {o || t('filters.all', { label })}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}
function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1">
      <span className="text-neutral-600">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

/* --------- Detail Modal (besar & lengkap) + LAPORKAN --------- */
function DetailModal({
  job,
  postedText,
  onClose,
  onApply,
}: {
  job: Job;
  postedText: string;
  onClose: () => void;
  onApply: () => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 backdrop-blur-[2px] bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-[0_15px_70px_-15px_rgba(0,0,0,0.5)]">
          {/* Header (pakai logo perusahaan) */}
          <div className="px-6 pt-6 pb-3 border-b border-slate-200">
            <div className="flex justify-center mb-3">
              <AvatarLogo name={job.company || job.title} src={job.logo || undefined} size={64} />
            </div>
            <h2 className="text-center text-lg font-semibold text-slate-900">Detail Lowongan</h2>
            <p className="mt-1 text-center text-sm text-slate-600">{postedText}</p>
          </div>

          {/* Body (scrollable) */}
          <div className="max-h-[65vh] overflow-auto px-6 py-5 space-y-5">
            <div>
              <div className="text-xl font-bold text-slate-900">{job.title}</div>
              <div className="text-sm text-slate-600">{job.company}</div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <InfoRow label="Lokasi" value={job.location} />
              <InfoRow label="Kontrak" value={job.contract} />
              <InfoRow label="Mode Kerja" value={job.remote} />
              {(job.salaryMin != null || job.salaryMax != null) && (
                <InfoRow label="Gaji" value={formatSalary(job.salaryMin, job.salaryMax, job.currency)} />
              )}
            </div>

            <Section title="Deskripsi Pekerjaan">
              <RichText text={job.description || '-'} />
            </Section>

            {job.requirements ? (
              <Section title="Persyaratan">
                <RichText text={job.requirements} />
              </Section>
            ) : null}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setReportOpen(true)}
              className="rounded-xl border border-red-500 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Laporkan
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Tutup
            </button>
            <button
              onClick={onApply}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Lamar
            </button>
          </div>
        </div>
      </div>

      {reportOpen && (
        <ReportDialog job={job} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}

/* ---------- Dialog Laporkan ---------- */
function ReportDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const [reason, setReason] = useState<string>('Spam / Penipuan');
  const [note, setNote] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submitReport() {
    setSending(true);
    setErr(null);
    try {
      const res = await fetch('/api/jobs/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          title: job.title,
          company: job.company,
          reason,
          note,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDone(true);
    } catch (e: any) {
      // fallback simpan lokal
      try {
        const key = 'ark_job_reports';
        const list = JSON.parse(localStorage.getItem(key) ?? '[]');
        list.push({
          at: new Date().toISOString(),
          jobId: job.id,
          title: job.title,
          company: job.company,
          reason,
          note,
        });
        localStorage.setItem(key, JSON.stringify(list));
        setDone(true);
      } catch {
        setErr('Gagal mengirim laporan.');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 h-12">
            <div className="text-sm font-semibold">Laporkan Lowongan</div>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-200 hover:bg-neutral-50"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-900">{job.title}</div>
              <div className="text-slate-600">{job.company}</div>
            </div>

            {done ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                Terima kasih. Laporanmu telah kami terima.
              </div>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">
                    Alasan
                  </span>
                  <select
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    {[
                      'Spam / Penipuan',
                      'Informasi Menyesatkan',
                      'Konten Tidak Pantas',
                      'Duplikat / Sudah Tidak Aktif',
                      'Lainnya',
                    ].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">
                    Catatan (opsional)
                  </span>
                  <textarea
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 min-h-[90px]"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Tambahkan detail yang membantu tim kami meninjau laporanmu."
                  />
                </label>

                {err && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">
                    {err}
                  </div>
                )}

                <div className="pt-1 flex items-center justify-end gap-2">
                  <button
                    onClick={onClose}
                    disabled={sending}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Batal
                  </button>
                  <button
                    onClick={submitReport}
                    disabled={sending}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {sending ? 'Mengirim…' : 'Kirim Laporan'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800">
        {children}
      </div>
    </section>
  );
}

function RichText({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const isList = lines.some((l) => l.startsWith('- ') || l.startsWith('• '));

  if (isList) {
    const items = lines.map((l) => l.replace(/^[-•]\s?/, '')).filter(Boolean);
    return (
      <ul className="list-disc pl-5 space-y-1">
        {items.map((it, idx) => (
          <li key={idx}>{it}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-2">
      {text.split('\n').map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

/* ------------ Drawer & Empty ------------ */
function Drawer({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-[85%] max-w-xs bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 h-12">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-200">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="p-3 space-y-3">{children}</div>
      </div>
    </div>
  );
}
function EmptyState({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-neutral-100 grid place-items-center">
        <SearchIcon className="h-6 w-6 text-neutral-600" />
      </div>
      <h3 className="font-semibold text-neutral-900">{t('empty.title')}</h3>
      <p className="mt-1 text-sm text-neutral-600">{t('empty.desc')}</p>
    </div>
  );
}

/* ------------ Icons ------------ */
function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function PinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 22s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function LayersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 3l8 4-8 4-8-4 8-4z" stroke="currentColor" strokeWidth="2" />
      <path d="M4 11l8 4 8-4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 15l8 4 8-4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function BriefcaseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function MoneyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M7 9h0M17 15h0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function CogIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2" />
      <path d="M19.4 15a7.97 7.97 0 000-6l-2.1.5a6 6 0 00-1.5-1.5l.5-2.1a8 8 0 00-6 0l.5 2.1a6 6 0 001.5-1.5l-2.1-.5a7.97 7.97 0 000 6l2.1-.5z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function GlobeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 6h16M6 12h12M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ------------ Utils ------------ */
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* ------------ Small: Avatar Logo (dipakai header modal) ------------ */
function AvatarLogo({ name, src, size = 64 }: { name?: string; src?: string | null; size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-full overflow-hidden bg-gradient-to-tr from-blue-600 via-blue-500 to-amber-400 text-white font-bold"
      style={{ width: size, height: size }}
      aria-label="Company logo"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name || 'logo'} className="h-full w-full object-cover" />
      ) : (
        <span className="select-none text-xl">{initials(name || 'AW')}</span>
      )}
    </div>
  );
}
