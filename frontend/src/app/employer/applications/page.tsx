'use client';

import { useEffect, useState } from 'react';
import Nav from '@/components/nav';
import Footer from '@/components/Footer';

const API =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

type AppRow = {
  id: string;
  candidateName: string;
  candidateEmail?: string | null;
  jobTitle: string;
  status: 'submitted' | 'review' | 'shortlist' | 'rejected' | 'hired';
  createdAt: string; // ISO
};

type Counters = {
  submitted: number;
  review: number;
  shortlist: number;
  rejected: number;
  hired: number;
};

const EMPTY_COUNTERS: Counters = {
  submitted: 0,
  review: 0,
  shortlist: 0,
  rejected: 0,
  hired: 0,
};

export default function EmployerApplicationsPage() {
  const [rows, setRows] = useState<AppRow[]>([]);
  const [counters, setCounters] = useState<Counters>(EMPTY_COUNTERS);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

      // kalau HTTP error → tampilkan error
      if (!res.ok) {
        setErr(json?.error || `HTTP ${res.status}`);
        setRows([]);
        setCounters(EMPTY_COUNTERS);
        return;
      }

      // server baru: { ok: true, data: { rows, counters } }
      // server lama: { rows, counters }
      const payload = json?.data || json || {};
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
      setCounters(
        payload.counters && typeof payload.counters === 'object'
          ? payload.counters
          : EMPTY_COUNTERS
      );
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

  const pretty = (iso?: string) =>
    !iso ? '-' : new Date(iso).toLocaleDateString();

  return (
    <>
      <Nav />
      <main className="min-h-[60vh] bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <h1 className="mb-2 text-2xl font-semibold text-slate-900">Applications</h1>
          <p className="mb-6 text-sm text-slate-600">
            Semua pelamar dari lowongan perusahaan Anda.
          </p>

          {/* Ringkasan status */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-6">
            {[
              { label: 'SUBMITTED', val: counters.submitted },
              { label: 'REVIEW', val: counters.review },
              { label: 'SHORTLIST', val: counters.shortlist },
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
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-600">
                      Loading…
                    </td>
                  </tr>
                )}

                {!loading && err && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-rose-600">
                      Error: {err}{' '}
                      {/^HTTP 401/.test(err) && (
                        <span className="text-slate-600">
                          – Kamu perlu login sebagai employer.{' '}
                          <a href="/employer/login" className="text-blue-700 underline">Login</a>
                        </span>
                      )}
                    </td>
                  </tr>
                )}

                {!loading && !err && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-600">
                      Belum ada pelamar.
                    </td>
                  </tr>
                )}

                {!loading && !err && rows.map((r) => (
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
                  </tr>
                ))}
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
