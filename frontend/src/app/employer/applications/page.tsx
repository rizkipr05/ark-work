'use client';

import { useEffect, useState } from 'react';
import Nav from '@/components/nav';
import Footer from '@/components/Footer';

const API =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

/* ===== Hanya 3 status yang dipakai di UI ===== */
type StatusAllowed = 'submitted' | 'rejected' | 'hired';

type AppRow = {
  id: string;
  candidateName: string;
  candidateEmail?: string | null;
  jobTitle: string;
  status: string; // tetap string agar data lama (review/shortlist) tetap terbaca
  createdAt: string | null; // ISO | null
  cv?: { url: string; name?: string | null; type?: string | null; size?: number | null } | null;
};

type Counters = {
  submitted: number;
  rejected: number;
  hired: number;
};

const EMPTY_COUNTERS: Counters = {
  submitted: 0,
  rejected: 0,
  hired: 0,
};

/* Dropdown status yang diizinkan */
const ALLOWED: readonly StatusAllowed[] = ['submitted', 'rejected', 'hired'] as const;

export default function EmployerApplicationsPage() {
  const [rows, setRows] = useState<AppRow[]>([]);
  const [counters, setCounters] = useState<Counters>(EMPTY_COUNTERS);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setErr(null);

    const employerId = localStorage.getItem('ark_employer_id') || '';
    try {
      const base = (API || '').replace(/\/+$/, '');
      const u = new URL(`${base}/api/employers/applications`);
      const jobId = new URLSearchParams(window.location.search).get('jobId');
      if (jobId) u.searchParams.set('jobId', jobId);

      const res = await fetch(u.toString(), {
        credentials: 'include',
        headers: { 'X-Employer-Id': employerId },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error || `HTTP ${res.status}`);
        setRows([]);
        setCounters(EMPTY_COUNTERS);
        return;
      }

      const payload = json?.data || json || {};
      const list: AppRow[] = Array.isArray(payload.rows) ? payload.rows : [];
      setRows(list);
      setCounters(recomputeCounters(list));
    } catch (e: any) {
      setErr(e?.message || 'Network error');
      setRows([]);
      setCounters(EMPTY_COUNTERS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const pretty = (iso: string | null | undefined) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // helper agar link CV bisa diakses lintas origin
  const cvHref = (partial?: string | null) => {
    if (!partial) return '#';
    const base = (API || '').replace(/\/+$/, '');
    if (/^https?:\/\//i.test(partial)) return partial;
    return `${base}${partial.startsWith('/') ? '' : '/'}${partial}`;
  };

  // Hitung ulang counters lokal – hanya 3 status yang dihitung
  const recomputeCounters = (list: AppRow[]): Counters => {
    const c = { ...EMPTY_COUNTERS };
    for (const r of list) {
      const s = r.status as StatusAllowed;
      if ((ALLOWED as readonly string[]).includes(s)) {
        // @ts-ignore safe
        c[s] += 1;
      }
    }
    return c;
  };

  // Update status (optimistic) – hanya 3 status yang diizinkan
  const updateStatus = async (id: string, newStatus: StatusAllowed) => {
    const base = (API || '').replace(/\/+$/, '');
    const employerId = localStorage.getItem('ark_employer_id') || '';

    // Simpan snapshot untuk rollback jika gagal
    const before = rows;
    const next = rows.map((r) => (r.id === id ? { ...r, status: newStatus } : r));
    setRows(next);
    setCounters(recomputeCounters(next));
    setSavingIds((m) => ({ ...m, [id]: true }));
    setErr(null);

    try {
      const res = await fetch(`${base}/api/employers/applications/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Employer-Id': employerId,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      // rollback
      setRows(before);
      setCounters(recomputeCounters(before));
      setErr(e?.message || 'Gagal memperbarui status');
    } finally {
      setSavingIds((m) => ({ ...m, [id]: false }));
    }
  };

  const onAccept = (row: AppRow) => {
    if (!confirm(`Terima pelamar "${row.candidateName}" untuk posisi ${row.jobTitle}?`)) return;
    updateStatus(row.id, 'hired');
  };

  const onReject = (row: AppRow) => {
    if (!confirm(`Tolak pelamar "${row.candidateName}" untuk posisi ${row.jobTitle}?`)) return;
    updateStatus(row.id, 'rejected');
  };

  return (
    <>
      <Nav />
      <main className="min-h-[60vh] bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <h1 className="mb-2 text-2xl font-semibold text-slate-900">Applications</h1>
          <p className="mb-6 text-sm text-slate-600">
            Semua pelamar dari lowongan perusahaan Anda.
          </p>

          {/* Ringkasan status – hanya 3 kartu */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: 'SUBMITTED', val: counters.submitted },
              { label: 'REJECTED', val: counters.rejected },
              { label: 'HIRED', val: counters.hired },
            ].map((it) => (
              <div key={it.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">{it.label}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{it.val}</div>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">CV</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-600">
                      Loading…
                    </td>
                  </tr>
                )}

                {!loading && err && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center">
                      <span className="text-rose-600">Error: {err}</span>{' '}
                      {/^HTTP 401/.test(err) && (
                        <span className="text-slate-600">
                          – Kamu perlu login sebagai employer.{' '}
                          <a href="/employer/login" className="text-blue-700 underline">
                            Login
                          </a>
                        </span>
                      )}
                    </td>
                  </tr>
                )}

                {!loading && !err && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-600">
                      Belum ada pelamar.
                    </td>
                  </tr>
                )}

                {!loading &&
                  !err &&
                  rows.map((r) => {
                    const saving = !!savingIds[r.id];
                    // kalau status bukan salah satu yg diizinkan (mis. 'review'/'shortlist'),
                    // dropdown akan default ke 'submitted' sampai user mengganti
                    const selectValue: StatusAllowed = (ALLOWED.includes(r.status as StatusAllowed)
                      ? (r.status as StatusAllowed)
                      : 'submitted');

                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-900">{r.candidateName}</td>
                        <td className="px-4 py-3 text-slate-700">{r.candidateEmail || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{r.jobTitle}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{pretty(r.createdAt)}</td>
                        <td className="px-4 py-3">
                          {r.cv ? (
                            <a
                              href={cvHref(r.cv.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-700 underline"
                            >
                              {r.cv.name || 'CV'}
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => onAccept(r)}
                              disabled={saving}
                              className={`rounded-full px-3 py-1 text-xs font-medium text-white ${
                                saving ? 'bg-green-400' : 'bg-green-600 hover:bg-green-700'
                              } disabled:opacity-60`}
                              title="Terima (ubah status ke HIRED)"
                            >
                              {saving ? 'Menyimpan…' : 'Terima'}
                            </button>
                            <button
                              onClick={() => onReject(r)}
                              disabled={saving}
                              className={`rounded-full px-3 py-1 text-xs font-medium text-white ${
                                saving ? 'bg-rose-400' : 'bg-rose-600 hover:bg-rose-700'
                              } disabled:opacity-60`}
                              title="Tolak (ubah status ke REJECTED)"
                            >
                              Tolak
                            </button>

                            {/* Quick change – hanya 3 status */}
                            <select
                              value={selectValue}
                              disabled={saving}
                              onChange={(e) => updateStatus(r.id, e.target.value as StatusAllowed)}
                              className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                              title="Ubah status cepat"
                            >
                              {ALLOWED.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Tip: tambahkan query <code>?jobId=&lt;JOB_ID&gt;</code> untuk melihat pelamar 1 job tertentu.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
