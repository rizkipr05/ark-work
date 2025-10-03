'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/* ---------------- Env ---------------- */
const API =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

/* ---------------- Types ---------------- */
type CreatePayload = {
  title: string;
  location?: string;
  employment?: string;
  description?: string;
  isDraft?: boolean;
  experienceMinYears?: number | null;
  education?: 'SMA/SMK' | 'D3' | 'S1' | 'S2' | 'S3' | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  tags?: string[];
  remoteMode?: 'ON_SITE' | 'REMOTE' | 'HYBRID';
  company?: string;
  deadline?: string | null;
  requirements?: string;
};

type Province = { id: string; name: string };
type City = { id: string; name: string };

/* ---------------- Helpers ---------------- */
const cleanNum = (s: string) => String(s ?? '').replace(/[^\d]/g, '');
const toIntOrNull = (s?: string | null) => {
  const n = Number(cleanNum(s ?? ''));
  return Number.isFinite(n) && String(s ?? '').trim() !== '' ? n : null;
};
const fmtThousands = (v: string) =>
  cleanNum(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/* ======================================================================== */
export default function NewJobPage() {
  const router = useRouter();
  const qs = useSearchParams();
  const editId = qs.get('id');

  /* -------- UI state -------- */
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  /* -------- Employer (login) -------- */
  const [employerId, setEmployerId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>(''); // read-only badge

  /* -------- Wilayah (Emsifa) -------- */
  const [prov, setProv] = useState('');
  const [kab, setKab] = useState('');
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [cities, setCities] = useState<City[]>([]);

  /* -------- Form -------- */
  const [form, setForm] = useState({
    title: '',
    location: '',
    employment: 'Full-time',
    description: '',
    isDraft: false,
    remote: false,
    salaryMin: '',
    salaryMax: '',
    currency: 'IDR',
    deadline: '',
    tags: '',
    requirements: '',
    experienceMinYears: '',
    education: '' as '' | 'SMA/SMK' | 'D3' | 'S1' | 'S2' | 'S3',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  /* ===================== 1) Fetch employer yg login ===================== */
  useEffect(() => {
    (async () => {
      try {
        const base = API.replace(/\/+$/, '');
        // ⬇️ GANTI: pakai endpoint yang baca DB
        const r = await fetch(`${base}/api/employers/me`, {
          credentials: 'include',
        });

        let eid: string | undefined;
        let comp: string | undefined;

        if (r.ok) {
          const j = await r.json().catch(() => ({} as any));
          console.log('[employers/me] payload =', j);

          // ---- id ----
          eid =
            j?.employer?.id ||
            j?.data?.employer?.id ||
            j?.id ||
            undefined;

          // ---- company name (displayName camelCase + snake_case fallback) ----
          comp =
            j?.employer?.displayName ||
            j?.data?.employer?.displayName ||
            j?.employer?.display_name ||
            j?.data?.employer?.display_name ||
            j?.employer?.legalName ||
            j?.employer?.legal_name ||
            undefined;
        } else {
          console.warn('[employers/me] HTTP', r.status);
        }

        // Fallback localStorage (kalau ada dari proses lain)
        if (!eid) eid = localStorage.getItem('ark_employer_id') || undefined;
        if (!comp) comp = localStorage.getItem('ark_employer_company') || undefined;

        if (eid) setEmployerId(String(eid));
        if (comp) setCompanyName(String(comp));
      } catch (err) {
        console.warn('[employers/me] error:', err);
      }
    })();
  }, []);

  /* ===================== 2) Wilayah (Emsifa) ===================== */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(
          'https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json'
        );
        const j = (await r.json()) as Province[];
        setProvinces(j);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!prov) {
      setCities([]);
      setKab('');
      set('location', '');
      return;
    }
    (async () => {
      try {
        const r = await fetch(
          `https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${prov}.json`
        );
        const j = (await r.json()) as City[];
        setCities(j);
        setKab('');
        const pName = provinces.find((p) => p.id === prov)?.name || '';
        set('location', pName);
      } catch {}
    })();
  }, [prov, provinces]);

  useEffect(() => {
    const pName = provinces.find((x) => x.id === prov)?.name || '';
    const kName = cities.find((x) => x.id === kab)?.name || '';
    const loc = [kName, pName].filter(Boolean).join(', ');
    set('location', loc);
  }, [kab, prov, provinces, cities]);

  /* ===================== 3) Salary formatter ===================== */
  const onSalaryMinChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    set('salaryMin', fmtThousands(e.target.value));
  const onSalaryMaxChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    set('salaryMax', fmtThousands(e.target.value));

  /* ===================== 4) Submit ===================== */
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!employerId) {
      setToast({
        type: 'err',
        msg: 'Tidak menemukan employer yang login. Silakan login sebagai employer.',
      });
      return;
    }
    if (!companyName.trim()) {
      setToast({ type: 'err', msg: 'Profil perusahaan belum lengkap (nama perusahaan).' });
      return;
    }
    if (!form.title.trim()) {
      setToast({ type: 'err', msg: 'Judul lowongan wajib diisi.' });
      return;
    }
    if (!prov || !kab) {
      setToast({ type: 'err', msg: 'Pilih Provinsi dan Kab/Kota.' });
      return;
    }

    setBusy(true);
    setToast(null);

    try {
      const payload: CreatePayload = {
        title: form.title.trim(),
        location: form.location,
        employment: form.employment,
        description: form.description,
        isDraft: form.isDraft,
        experienceMinYears: toIntOrNull(form.experienceMinYears),
        education: (form.education || null) as CreatePayload['education'],
        salaryMin: toIntOrNull(form.salaryMin),
        salaryMax: toIntOrNull(form.salaryMax),
        currency: form.currency,
        tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
        remoteMode: form.remote ? 'REMOTE' : 'ON_SITE',
        company: companyName,           // ← dari profile
        deadline: form.deadline || null,
        requirements: form.requirements,
      };

      const res = await fetch(`${API.replace(/\/+$/, '')}/api/employer/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // penting untuk session/cookie
        body: JSON.stringify({ ...payload, employerId }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !(json as any)?.ok) {
        const msg = (json as any)?.error || `HTTP ${res.status}`;
        setSuccessMsg(`Tersimpan lokal. Gagal menyimpan ke server: ${msg}`);
        return;
      }
      setSuccessMsg('Job berhasil dipublikasikan.');
    } catch (err: any) {
      setSuccessMsg(
        err?.message === 'Failed to fetch'
          ? 'Gagal terhubung ke server. Periksa BACKEND & NEXT_PUBLIC_API_BASE.'
          : err?.message || 'Gagal menyimpan.'
      );
    } finally {
      setBusy(false);
    }
  }

  /* ===================== 5) UI ===================== */
  return (
    <main className="min-h-[60vh] bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          {editId ? 'Edit Job' : 'Post a Job'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Isi detail lowongan. Nama perusahaan otomatis dari profil employer.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {/* Company badge + Job title */}
          <div className="grid gap-4 sm:grid-cols-[1fr,2fr] items-end">
            <div>
              <div className="text-xs text-slate-600 mb-1">Company</div>
              <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
                <span className="truncate font-medium">{companyName || '—'}</span>
              </div>
              {!companyName && (
                <div className="mt-1 text-xs text-amber-600">
                  Nama perusahaan belum terbaca—pastikan sudah login sebagai employer.
                </div>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Job Title</span>
              <input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="Frontend Engineer"
              />
            </label>
          </div>

          {/* Lokasi via Emsifa */}
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Provinsi</span>
              <select value={prov} onChange={(e) => setProv(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="">-- pilih --</option>
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Kab/Kota</span>
              <select value={kab} onChange={(e) => setKab(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" disabled={!prov}>
                <option value="">-- pilih --</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Location (gabungan)</span>
              <input value={form.location} readOnly className="w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm" placeholder="Kab/Kota, Provinsi" />
            </label>
          </div>

          {/* Employment + Currency + Remote */}
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Employment</span>
              <select value={form.employment} onChange={(e) => set('employment', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option>Full-time</option>
                <option>Part-time</option>
                <option>Contract</option>
                <option>Internship</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Currency</span>
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option>IDR</option>
                <option>USD</option>
              </select>
            </label>
            <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.remote} onChange={(e) => set('remote', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
              Remote-friendly
            </label>
          </div>

          {/* Salary */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Salary Min</span>
              <input value={form.salaryMin} onChange={onSalaryMinChange} inputMode="numeric" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="10,000,000" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Salary Max</span>
              <input value={form.salaryMax} onChange={onSalaryMaxChange} inputMode="numeric" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="20,000,000" />
            </label>
          </div>

          {/* Experience + Education + Deadline */}
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Min Experience (years)</span>
              <input value={form.experienceMinYears} onChange={(e) => set('experienceMinYears', cleanNum(e.target.value))} inputMode="numeric" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="0" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Education</span>
              <select value={form.education} onChange={(e) => set('education', e.target.value as any)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="">Any</option>
                <option value="SMA/SMK">SMA/SMK</option>
                <option value="D3">D3</option>
                <option value="S1">S1</option>
                <option value="S2">S2</option>
                <option value="S3">S3</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Deadline</span>
              <input type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </div>

          {/* Tags, Description, Requirements */}
          <label className="block">
            <span className="mb-1 block text-xs text-slate-600">Tags (comma separated)</span>
            <input value={form.tags} onChange={(e) => set('tags', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="react, nextjs, tailwind" />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-600">Description</span>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={5} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Describe the role…" />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-600">Requirements</span>
            <textarea value={form.requirements} onChange={(e) => set('requirements', e.target.value)} rows={5} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="- 3+ years…" />
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isDraft} onChange={(e) => set('isDraft', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
            Save as draft (server)
          </label>

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => history.back()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {busy ? 'Publishing…' : 'Publish Job'}
            </button>
          </div>
        </form>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className={`pointer-events-auto w-full max-w-md rounded-2xl border p-4 shadow-2xl backdrop-blur ${
            toast.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}>
            <div className="flex items-start gap-3">
              <div className="grid h-6 w-6 place-items-center rounded-full bg-black/10">
                {toast.type === 'ok' ? '✓' : '!'}
              </div>
              <div className="flex-1 text-sm">{toast.msg}</div>
              <button onClick={() => setToast(null)} className="rounded-lg border px-2 text-xs hover:bg-white/50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {successMsg && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-center text-lg font-semibold text-slate-900">Berhasil</h2>
            <p className="mt-2 whitespace-pre-line text-center text-sm text-slate-600">{successMsg}</p>
            <div className="mt-5">
              <button
                onClick={() => { setSuccessMsg(null); router.push('/jobs'); }}
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Oke
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
