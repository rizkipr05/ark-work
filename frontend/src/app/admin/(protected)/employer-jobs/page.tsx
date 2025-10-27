'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/* ======================= CONFIG ======================= */
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : '');

const api = (p: string) => `${(API_BASE || '').replace(/\/+$/, '')}${p}`;

/* ======================= TYPES ======================== */
type AdminJob = {
  id: string;
  title: string;
  company?: string | null;
  employer?: {
    id?: string;
    displayName?: string | null;
    profile?: { logoUrl?: string | null } | null;
  } | null;
  logoUrl?: string | null;
  location?: string | null;
  employment?: string | null;
  postedAt?: string | null;
  isActive?: boolean | null;
  status?: string | null;
};

/* ======================= PAGE ========================= */
export default function AdminEmployerJobsPage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus'); // << hanya tampilkan ini bila ada

  const [items, setItems] = useState<AdminJob[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<AdminJob | null>(null);

  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const setBusy = (id: string, v: boolean) =>
    setRowBusy((m) => ({ ...m, [id]: v }));

  /* ----------------- helpers fetch ----------------- */
  async function readErr(r: Response) {
    const t = await r.text().catch(() => '');
    return `${r.url} → ${r.status} ${r.statusText}${t ? ' — ' + t : ''}`;
  }
  async function tryFetch(url: string, init?: RequestInit) {
    try {
      const r = await fetch(url, { credentials: 'include', ...init });
      if (r.ok) return { ok: true as const, r, url };
      return { ok: false as const, r, url, msg: await readErr(r) };
    } catch (e: any) {
      return { ok: false as const, r: null, url, msg: `${url} → ${e?.message || 'network error'}` };
    }
  }
  async function callFirstOk(reqs: Array<() => Promise<Response>>) {
    for (const fn of reqs) {
      try {
        const r = await fn();
        if (r.ok) return r;
      } catch {}
    }
    throw new Error('Semua kandidat endpoint gagal');
  }

  /* --------------------- LOAD ----------------------- */
  const load = async () => {
    setLoading(true);
    try {
      const r = await callFirstOk([
        () => fetch(api('/api/admin/employer-jobs'), { cache: 'no-store', credentials: 'include' }),
        () => fetch(api('/api/employer-jobs'), { cache: 'no-store', credentials: 'include' }),
        () => fetch(api('/api/jobs'), { cache: 'no-store', credentials: 'include' }),
      ]);

      const json = await r.json().catch(() => ({} as any));
      const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];

      const rows: AdminJob[] = (list as any[])
        .map((x) => {
          const logo =
            x.logoUrl ??
            x.employer?.profile?.logoUrl ??
            x.companyLogo ??
            null;
          const company = x.company ?? x.employer?.displayName ?? null;

          return {
            id: String(x.id ?? x.jobId ?? ''),
            title: x.title ?? x.jobTitle ?? '-',
            company,
            employer: x.employer ?? null,
            logoUrl: logo,
            location: x.location ?? x.city ?? '—',
            employment: x.employment ?? x.type ?? x.employmentType ?? '—',
            postedAt: x.postedAt ?? x.createdAt ?? x.created_at ?? null,
            isActive:
              typeof x.isActive === 'boolean'
                ? x.isActive
                : (String(x.status ?? x.state ?? '').toLowerCase() === 'active' ? true : undefined),
            status: x.status ?? x.state ?? null,
          };
        })
        .filter((j) => j.id);

      setItems(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /* ------------- scroll highlight focus -------------- */
  useEffect(() => {
    if (!focusId) return;
    const el = cardRefs.current[focusId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ark-pulse');
      const t = setTimeout(() => el.classList.remove('ark-pulse'), 2500);
      return () => clearTimeout(t);
    }
  }, [focusId, items.length]);

  /* -------------------- ACTIONS --------------------- */
  const isActive = (j: AdminJob) =>
    typeof j.isActive === 'boolean' ? j.isActive : (j.status ?? '').toLowerCase() === 'active';

  const markActiveState = (id: string, active: boolean) =>
    setItems((arr) =>
      arr.map((j) => (j.id === id ? { ...j, isActive: active, status: active ? 'active' : 'inactive' } : j))
    );

  const activateJob = async (id: string) => {
    if (!confirm('Aktifkan job ini?')) return;
    setBusy(id, true);
    try {
      const tries = [
        () =>
          tryFetch(api(`/api/employer-jobs/${id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'ACTIVE' }),
          }),
        () =>
          tryFetch(api(`/api/jobs/${id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'ACTIVE' }),
          }),
        () =>
          tryFetch(api(`/api/admin/employer-jobs/${id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'ACTIVE' }),
          }),
        () => tryFetch(api(`/api/employer-jobs/${id}/activate`), { method: 'POST' }),
      ];
      const logs: string[] = [];
      for (const go of tries) {
        const res = await go();
        if (res.ok) {
          markActiveState(id, true);
          return;
        }
        logs.push(res.msg);
      }
      alert(`Gagal mengaktifkan job.\n\n${logs.join('\n')}`);
    } finally {
      setBusy(id, false);
    }
  };

  const deactivateJob = async (id: string) => {
    if (!confirm('Nonaktifkan job ini?')) return;
    setBusy(id, true);
    try {
      const tries = [
        () =>
          tryFetch(api(`/api/employer-jobs/${id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'INACTIVE' }),
          }),
        () => tryFetch(api(`/api/employer-jobs/${id}/deactivate`), { method: 'POST' }),
        () =>
          tryFetch(api(`/api/jobs/${id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'INACTIVE' }),
          }),
        () =>
          tryFetch(api(`/api/admin/employer-jobs/${id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'INACTIVE' }),
          }),
      ];
      const logs: string[] = [];
      for (const go of tries) {
        const res = await go();
        if (res.ok) {
          markActiveState(id, false);
          return;
        }
        logs.push(res.msg);
      }
      alert(`Gagal menonaktifkan job.\n\n${logs.join('\n')}`);
    } finally {
      setBusy(id, false);
    }
  };

  // --- baru: helper untuk hapus laporan terkait job di backend
  async function deleteReportsForJob(jobId: string) {
    try {
      const r = await fetch(api(`/api/admin/reports/by-job/${encodeURIComponent(jobId)}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        console.warn('deleteReportsForJob failed:', r.status, txt);
        return false;
      }
      return true;
    } catch (e) {
      console.error('deleteReportsForJob error', e);
      return false;
    }
  }

  const softDeleteJob = async (id: string) => {
    if (!confirm('Delete job ini?')) return; // <= ubah teks konfirmasi
    setBusy(id, true);
    try {
      const tries = [
        () => tryFetch(api(`/api/employer-jobs/${id}`), { method: 'DELETE' }),
        () => tryFetch(api(`/api/employer-jobs/${id}/soft-delete`), { method: 'POST' }),
        () => tryFetch(api(`/api/jobs/${id}?soft=1`), { method: 'DELETE' }),
        () => tryFetch(api(`/api/admin/employer-jobs/${id}`), { method: 'DELETE' }),
      ];
      const logs: string[] = [];
      for (const go of tries) {
        const res = await go();
        if (res.ok) {
          // job berhasil dihapus di salah satu endpoint -> juga hapus report
          const repOk = await deleteReportsForJob(id);
          // beri tahu halaman reports untuk reload (listener storage ada di reports page)
          try { localStorage.setItem('ark:report:ping', String(Date.now())); } catch {}
          setItems((arr) => arr.filter((j) => j.id !== id));
          if (detailJob?.id === id) setDetailOpen(false);
          if (!repOk) {
            alert('Job dihapus, namun gagal menghapus laporan terkait (cek console).');
          }
          return;
        }
        logs.push(res.msg);
      }
      alert(`Gagal delete job.\n\n${logs.join('\n')}`); // <= ubah teks alert
    } finally {
      setBusy(id, false);
    }
  };

  const hardDeleteJob = async (id: string) => {
    if (!confirm('PERINGATAN: Hapus permanen. Lanjut?')) return;
    setBusy(id, true);
    try {
      const tries = [
        () => tryFetch(api(`/api/employer-jobs/${id}`), { method: 'DELETE' }),
        () => tryFetch(api(`/api/jobs/${id}`), { method: 'DELETE' }),
        () => tryFetch(api(`/api/admin/employer-jobs/${id}?mode=hard`), { method: 'DELETE' }),
      ];
      const logs: string[] = [];
      for (const go of tries) {
        const res = await go();
        if (res.ok) {
          // also delete reports
          const repOk = await deleteReportsForJob(id);
          try { localStorage.setItem('ark:report:ping', String(Date.now())); } catch {}
          setItems((arr) => arr.filter((j) => j.id !== id));
          if (!repOk) alert('Job dihapus, namun gagal menghapus laporan terkait (cek console).');
          return;
        }
        logs.push(res.msg);
      }
      alert(`Gagal hard delete job.\n\n${logs.join('\n')}\nCatatan: kalau DB menolak karena relasi, gunakan Soft Delete.`);
    } finally {
      setBusy(id, false);
    }
  };

  /* -------------------- FILTERING -------------------- */
  const filteredAll = useMemo(() => {
    const k = q.trim().toLowerCase();
    const base = k
      ? items.filter((j) =>
          [j.title, j.company, j.employer?.displayName, j.location, j.employment, j.status]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(k)),
        )
      : items;
    return base;
  }, [items, q]);

  // >>> hanya tampilkan job yg difokuskan jika ada ?focus=
  const visible = useMemo(() => {
    if (focusId) return filteredAll.filter((j) => j.id === focusId);
    return filteredAll;
  }, [filteredAll, focusId]);

  /* ---------------------- UI ------------------------ */
  return (
    <main className="mx-auto max-w-7xl p-4">
      <style>{`
        .ark-pulse{outline:3px solid rgba(59,130,246,.8);outline-offset:2px;animation:arkPulse 1.2s ease-in-out 2;background:#eff6ff}
        @keyframes arkPulse{0%{background:#eff6ff}50%{background:#dbeafe}100%{background:transparent}}
      `}</style>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Admin · Moderasi Job Employer</h1>
          <p className="text-sm text-neutral-600">Aktifkan/nonaktifkan, atau delete postingan job.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul/perusahaan/lokasi…"
            className="w-72 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
          <button onClick={load} className="rounded-xl border px-3 py-2 hover:bg-gray-50">
            {loading ? 'Muat…' : 'Muat ulang'}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-neutral-100 grid place-items-center">
            <svg className="h-6 w-6 text-neutral-600" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </div>
          <h3 className="font-semibold text-neutral-900">Tidak ada data</h3>
          <p className="mt-1 text-sm text-neutral-600">Coba muat ulang atau ubah kata kunci pencarian.</p>
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((j) => {
            const active = isActive(j);
            const busy = !!rowBusy[j.id];
            return (
              <article
                key={j.id}
                ref={(el: HTMLElement | null) => {
                  cardRefs.current[j.id] = el;
                }}
                onClick={() => { setDetailJob(j); setDetailOpen(true); }}
                className="group cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition"
              >
                <div className="flex gap-4">
                  <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 via-blue-500 to-amber-400 grid place-items-center overflow-hidden text-white text-sm font-bold">
                    {j.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={j.company || 'logo'} src={j.logoUrl} className="h-full w-full object-cover" />
                    ) : (
                      <span className="select-none">{(j.company || 'AW').slice(0,2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-neutral-900">{j.title}</h3>
                        <p className="truncate text-sm text-neutral-600">{j.company || 'Perusahaan'}</p>
                      </div>
                      <span
                        className={`rounded-lg px-2 py-1 text-xs ${active ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-amber-50 text-amber-700 border border-amber-300'}`}
                        title="Status"
                      >
                        {active ? 'active' : 'inactive'}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[13px]">
                      <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="2"/></svg><span className="truncate">{j.location ?? '—'}</span></div>
                      <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2"/></svg><span className="truncate">{j.employment ?? '—'}</span></div>
                      <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4-8 4-8-4 8-4z" stroke="currentColor" strokeWidth="2"/></svg><span className="truncate">{j.employer?.id ? `EMP ${j.employer.id.slice(0,6)}…` : '—'}</span></div>
                      <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 3v4M16 3v4M3 11h18" stroke="currentColor" strokeWidth="2"/></svg><span className="truncate">{j.postedAt ? new Date(j.postedAt).toLocaleDateString() : '—'}</span></div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <button
                        disabled={busy || active}
                        onClick={(e) => { e.stopPropagation(); activateJob(j.id); }}
                        className="rounded-xl border px-2.5 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
                      >
                        Aktifkan
                      </button>
                      <button
                        disabled={busy || !active}
                        onClick={(e) => { e.stopPropagation(); deactivateJob(j.id); }}
                        className="rounded-xl border px-2.5 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
                      >
                        Nonaktifkan
                      </button>
                      <button
                        disabled={busy}
                        onClick={(e) => { e.stopPropagation(); softDeleteJob(j.id); }}
                        className="rounded-xl border px-2.5 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                      <button
                        disabled={busy}
                        onClick={(e) => { e.stopPropagation(); hardDeleteJob(j.id); }}
                        className="rounded-xl border px-2.5 py-1 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"
                        title="Hapus permanen"
                      >
                        Hard Delete
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* ======= DETAIL MODAL ======= */}
      {detailOpen && detailJob && (
        <DetailModal
          job={detailJob}
          onClose={() => setDetailOpen(false)}
          onActivate={() => activateJob(detailJob.id)}
          onDeactivate={() => deactivateJob(detailJob.id)}
          onSoftDelete={() => softDeleteJob(detailJob.id)}
          busy={!!rowBusy[detailJob.id]}
        />
      )}
    </main>
  );
}

/* ======================= DETAIL MODAL ======================== */
function DetailModal({
  job,
  busy,
  onClose,
  onActivate,
  onDeactivate,
  onSoftDelete,
}: {
  job: AdminJob;
  busy: boolean;
  onClose: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onSoftDelete: () => void;
}) {
  const active = (typeof job.isActive === 'boolean' ? job.isActive : (job.status ?? '').toLowerCase() === 'active');

  return (
    <div className="fixed inset-0 z-[100]" aria-modal role="dialog">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-blue-600 via-blue-500 to-amber-400 grid place-items-center overflow-hidden text-white text-sm font-bold">
              {job.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={job.company || 'logo'} src={job.logoUrl} className="h-full w-full object-cover" />
              ) : (
                <span className="select-none">{(job.company || 'AW').slice(0,2).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-neutral-900 truncate">{job.title}</div>
              <div className="text-sm text-neutral-600 truncate">{job.company || 'Perusahaan'}</div>
            </div>
            <span className={`ml-auto rounded-lg px-2 py-1 text-xs ${active ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-amber-50 text-amber-700 border border-amber-300'}`}>
              {active ? 'active' : 'inactive'}
            </span>
          </div>

          <div className="px-5 py-4 space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <span className="text-xs uppercase tracking-wide text-neutral-600">Lokasi</span>
              <span className="text-sm font-medium text-neutral-900">{job.location ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <span className="text-xs uppercase tracking-wide text-neutral-600">Tipe/Kontrak</span>
              <span className="text-sm font-medium text-neutral-900">{job.employment ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <span className="text-xs uppercase tracking-wide text-neutral-600">Employer ID</span>
              <span className="text-sm font-medium text-neutral-900">{job.employer?.id ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <span className="text-xs uppercase tracking-wide text-neutral-600">Dibuat</span>
              <span className="text-sm font-medium text-neutral-900">{job.postedAt ? new Date(job.postedAt).toLocaleDateString() : '—'}</span>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-neutral-200 grid grid-cols-2 gap-2">
            <button onClick={onClose} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">Tutup</button>
            <div className="flex items-center justify-end gap-2">
              <button disabled={busy || active} onClick={onActivate} className="rounded-xl border px-2.5 py-1 text-sm hover:bg-gray-50 disabled:opacity-50">Aktifkan</button>
              <button disabled={busy || !active} onClick={onDeactivate} className="rounded-xl border px-2.5 py-1 text-sm hover:bg-gray-50 disabled:opacity-50">Nonaktifkan</button>
              <button disabled={busy} onClick={onSoftDelete} className="rounded-xl border px-2.5 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
