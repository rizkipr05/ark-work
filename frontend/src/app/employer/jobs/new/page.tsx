'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type LocalJob = {
  id: number | string;
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
  requirements?: string;
  postedAt?: string;         // ISO
  status?: 'active' | 'closed';
  logo?: string | null;      // data URL base64
};

const LS_KEY = 'ark_jobs';

export default function NewJobPage() {
  const router = useRouter();
  const qs = useSearchParams();
  const editId = qs.get('id'); // jika ada => mode edit

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    company: '',
    location: '',
    type: 'full_time' as LocalJob['type'],
    remote: false,
    salaryMin: '',
    salaryMax: '',
    currency: 'IDR',
    deadline: '',
    tags: '', // comma separated
    description: '',
    requirements: '',
  });
  const [logo, setLogo] = useState<string | null>(null); // data URL
  const [logoName, setLogoName] = useState<string>('');

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  // Prefill saat edit
  useEffect(() => {
    if (!editId) return;
    try {
      const arr: LocalJob[] = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
      const cur = arr.find(j => String(j.id) === String(editId));
      if (cur) {
        setForm({
          title: cur.title,
          company: cur.company,
          location: cur.location,
          type: cur.type,
          remote: !!cur.remote,
          salaryMin: cur.salaryMin?.toString() ?? '',
          salaryMax: cur.salaryMax?.toString() ?? '',
          currency: cur.currency ?? 'IDR',
          deadline: cur.deadline ?? '',
          tags: (cur.tags ?? []).join(', '),
          description: cur.description ?? '',
          requirements: cur.requirements ?? '',
        });
        setLogo(cur.logo ?? null);
        setLogoName(cur.logo ? 'Logo terpilih' : '');
      }
    } catch {}
  }, [editId]);

  // handle file -> dataURL
  const onPickLogo: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setLogo(null); setLogoName(''); return; }
    setLogoName(f.name);
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(f);
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const nowIso = new Date().toISOString();

      let arr: LocalJob[] = [];
      try { arr = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); } catch {}

      const existing = editId ? arr.find(j => String(j.id) === String(editId)) : undefined;

      const rec: LocalJob = {
        id: editId ?? Date.now(),
        title: form.title.trim(),
        company: form.company.trim(),
        location: form.location.trim(),
        type: form.type,
        remote: !!form.remote,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
        currency: form.currency || 'IDR',
        deadline: form.deadline || null,
        tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
        description: form.description,
        requirements: form.requirements,
        postedAt: existing?.postedAt ?? nowIso,
        status: existing?.status ?? 'active',
        logo: logo ?? existing?.logo ?? null,
      };

      if (existing) {
        const i = arr.findIndex(j => String(j.id) === String(editId));
        if (i >= 0) arr[i] = { ...arr[i], ...rec, id: arr[i].id };
      } else {
        arr.push(rec);
      }

      localStorage.setItem(LS_KEY, JSON.stringify(arr));
      window.dispatchEvent(new Event('ark:jobs-updated'));

      // langsung ke /jobs
      router.push('/jobs');
    } catch (err: any) {
      setError(err?.message || 'Gagal menyimpan lowongan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[60vh] bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          {editId ? 'Edit Job' : 'Post a Job'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Isi detail lowongan untuk dipublikasikan.
        </p>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {/* Logo uploader */}
          <div className="grid gap-4 sm:grid-cols-[96px,1fr] items-center">
            <div className="h-20 w-20 rounded-2xl bg-slate-100 grid place-items-center overflow-hidden">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="logo" src={logo} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-slate-500">Logo</span>
              )}
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Company Logo</label>
              <input type="file" accept="image/*" onChange={onPickLogo}
                     className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-slate-300 file:px-3 file:py-1.5 file:bg-white" />
              {logoName && <div className="mt-1 text-xs text-slate-600 truncate">{logoName}</div>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Company Name</span>
              <input value={form.company} onChange={(e)=>set('company', e.target.value)} required className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="PT ArkWork Indonesia" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Job Title</span>
              <input value={form.title} onChange={(e)=>set('title', e.target.value)} required className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Frontend Engineer" />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Location</span>
              <input value={form.location} onChange={(e)=>set('location', e.target.value)} required className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Jakarta / Remote" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Type</span>
              <select value={form.type} onChange={(e)=>set('type', e.target.value as any)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Currency</span>
              <select value={form.currency} onChange={(e)=>set('currency', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option>IDR</option><option>USD</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Deadline</span>
              <input type="date" value={form.deadline} onChange={(e)=>set('deadline', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.remote} onChange={(e)=>set('remote', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
              Remote-friendly
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Salary Min</span>
              <input inputMode="numeric" pattern="[0-9]*" value={form.salaryMin} onChange={(e)=>set('salaryMin', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="10000000" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Salary Max</span>
              <input inputMode="numeric" pattern="[0-9]*" value={form.salaryMax} onChange={(e)=>set('salaryMax', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="20000000" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-600">Tags (comma separated)</span>
            <input value={form.tags} onChange={(e)=>set('tags', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="react, nextjs, tailwind" />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-600">Description</span>
            <textarea value={form.description} onChange={(e)=>set('description', e.target.value)} rows={5} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Describe the role, team, responsibilities..." />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-600">Requirements</span>
            <textarea value={form.requirements} onChange={(e)=>set('requirements', e.target.value)} rows={5} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="e.g., 3+ years of experience, familiar with React, etc." />
          </label>

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => history.back()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {busy ? (editId ? 'Updating…' : 'Publishing…') : (editId ? 'Update Job' : 'Publish Job')}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
