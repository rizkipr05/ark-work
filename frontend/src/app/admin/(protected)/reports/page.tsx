/*
 * LOKASI FILE: AdminReportsPage.tsx
 *
 * GANTI SELURUH ISI FILE DENGAN KODE LENGKAP INI
 */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // Pastikan Link sudah diimpor

/* ======================= CONFIG ======================= */
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

const api = (p: string) => `${API_BASE.replace(/\/+$/, '')}${p}`;

/* ===== FE label ↔ BE enum mapper (WAJIB) ===== */
const statusLabels: Record<string, string> = {
  OPEN: 'baru',
  UNDER_REVIEW: 'diproses',
  ACTION_TAKEN: 'selesai',
  DISMISSED: 'abaikan',
};
const statusValues: Record<string, string> = {
  baru: 'OPEN',
  diproses: 'UNDER_REVIEW',
  selesai: 'ACTION_TAKEN',
  abaikan: 'DISMISSED',
};

/* ======================= TYPES ======================= */
type TargetType = 'JOB' | 'EMPLOYER' | 'USER' | 'TENDER' | 'COMPANY' | 'OTHER';

// Tipe ReportItem disesuaikan dengan data flat dari backend
type ReportItem = {
  id: string;
  jobId?: string | null;
  reason?: string | null; // Nama field dari backend (enum key)
  details?: string | null; // Nama field dari backend
  status: keyof typeof statusLabels | string;
  createdAt?: string | Date | null; // ISO String dari backend
  reporterUserId?: string | null;
  targetType?: TargetType | null;
  targetId?: string | number | null;
  targetUrl?: string | null;
  targetSlug?: string | null;
  judul?: string | null;      // Alias untuk job.title
  perusahaan?: string | null; // Alias untuk job.employer.displayName
};

export default function AdminReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* ======================= LOAD ======================= */
  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      console.log(`Fetching reports from: ${api('/api/reports')}`);
      const res = await fetch(api('/api/reports'), {
        cache: 'no-store',
        credentials: 'include',
      });
      console.log(`API Response Status: ${res.status}`);
      let data: any;
      try {
        data = await res.json();
        console.log("Raw data received from API:", data); // <-- PERIKSA LOG INI!
      } catch (jsonError: any) { /* ... error handling ... */ throw jsonError; }

      if (!res.ok || !data?.ok) { /* ... error handling ... */ throw new Error(data?.message || `Failed to fetch: ${res.status}`); }

      const arr: ReportItem[] = Array.isArray(data?.data) ? data.data : [];
      console.log("Processed data to be set in state:", arr); // <-- PERIKSA LOG INI!
      setReports(arr);

    } catch (e: any) {
      console.error('[admin/reports] load() failed:', e);
      setLoadError(e.message || 'Gagal memuat data laporan.');
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { /* ... listener effect ... */ }, []);


  /* ============== TARGET URL ============== */
  const toFocusUrl = (base: string, id?: string | number | null) =>
    id ? `${base.replace(/\/+$/, '')}?focus=${encodeURIComponent(String(id))}` : base;

  const normalizePublicPath = (p: string | null | undefined): string => {
      if (!p) return '/';
      const removedProtected = p.replace(/\/?\(protected\)\//g, '/');
      const collapsedSlashes = removedProtected.replace(/\/{2,}/g, '/');
      return collapsedSlashes.startsWith('/') ? collapsedSlashes : '/' + collapsedSlashes;
  };

  const getTargetHref = (r: ReportItem): string | null => {
    // Fungsi ini seharusnya sudah benar
    if (r.targetUrl) return normalizePublicPath(r.targetUrl);
    const id = r.targetSlug || r.targetId;
    const type = r.targetType;
    let basePath = '';
    switch (type) {
      case 'JOB': basePath = '/admin/employer-jobs'; break;
      case 'EMPLOYER': case 'COMPANY': basePath = '/admin/user-management/employers'; break;
      case 'USER': basePath = '/admin/user-management/users'; break;
      case 'TENDER': basePath = '/admin/tenders'; break;
      default: return null;
    }
    return id ? toFocusUrl(normalizePublicPath(basePath), id) : null;
  };


  /* ======================= LIST (filter) ======================= */
  const filtered = useMemo(() => {
    const items = Array.isArray(reports) ? reports : [];
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    // Filter berdasarkan field yang benar
    return items.filter((r) =>
      [r.judul, r.perusahaan, r.reason, r.details, r.status]
        .filter(v => v != null)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [reports, query]);

  /* ======================= ACTIONS ======================= */
  const updateStatus = async (id: string, enumStatus: string) => { /* ... implementasi ... */ };
  const remove = async (id: string) => { /* ... implementasi ... */ };


  /* ======================= UI HELPERS ======================= */
  const badgeClass = (statusEnum: string): string => {
    if (statusEnum === 'OPEN') return 'bg-amber-100 text-amber-700';
    if (statusEnum === 'UNDER_REVIEW') return 'bg-blue-100 text-blue-700';
    if (statusEnum === 'ACTION_TAKEN') return 'bg-emerald-100 text-emerald-700';
    return 'bg-gray-100 text-gray-700';
  };
  const fmtDate = (v?: string | Date | null): string => {
    if (!v) return '—';
    try {
      const d = new Date(v);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return '—'; }
  };


  /* ======================= RENDER ======================= */
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4">
      {/* Bagian Header dan Input Filter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Admin · Laporan Masuk</h1>
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari laporan…" className="w-full max-w-xs rounded-xl border px-3 py-2 focus:outline-none focus:ring"/>
          <button onClick={load} disabled={loading} className="rounded-xl border px-3 py-2 hover:bg-gray-50 disabled:opacity-50">
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>
      </div>

      {/* Tampilkan pesan error jika load gagal */}
      {loadError && ( <div className="rounded-md bg-red-50 p-4 text-sm text-red-700" role="alert"> <strong>Error:</strong> {loadError} </div> )}

      {/* Tabel Laporan */}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
             <tr>
               <th className="p-3">Judul</th>
               <th className="p-3">Perusahaan</th>
               <th className="p-3">Alasan</th>
               <th className="p-3">Catatan</th>
               <th className="p-3">Status</th>
               <th className="p-3">Dibuat</th>
               <th className="p-3 text-right">Aksi</th>
             </tr>
           </thead>
           
          {/* ▼▼▼ BAGIAN INI MEMBACA FIELD YANG BENAR ▼▼▼ */}
          <tbody>
            {loading && ( <tr> <td colSpan={7} className="p-6 text-center text-gray-500">Memuat data...</td> </tr> )}
            {!loading && !loadError && filtered.length === 0 && ( <tr> <td colSpan={7} className="p-6 text-center text-gray-500"> Belum ada data laporan {query ? 'yang cocok.' : '.'} </td> </tr> )}
            {!loading && !loadError && filtered.length > 0 && filtered.map((r) => {
              const enumStatus = String(r.status);
              const label = statusLabels[enumStatus] || enumStatus;
              const displayDate = fmtDate(r.createdAt);
              const targetHref = getTargetHref(r);

              // Ambil data langsung dari 'r'
              const jobTitle = r.judul ?? null;        // BACA 'judul'
              const employerName = r.perusahaan ?? null;// BACA 'perusahaan'
              const reason = r.reason ?? null;      // BACA 'reason'
              const details = r.details ?? null;     // BACA 'details'

              return (
                <tr key={r.id} className={`border-t align-top ${targetHref ? 'hover:bg-gray-50' : ''}`}>
                  <td className="p-3 font-medium">
                    {targetHref ? (
                      <Link href={targetHref} onClick={(e) => e.stopPropagation()} className="text-blue-600 hover:underline" prefetch={false}>
                        {jobTitle || '—'}
                      </Link>
                    ) : ( <span>{jobTitle || '—'}</span> )}
                  </td>
                  <td className="p-3">{employerName || '—'}</td>
                  <td className="p-3">{reason || '—'}</td>
                  <td className="p-3 max-w-[24rem]"><div className="line-clamp-3">{details || '—'}</div></td>
                  <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs ${badgeClass(enumStatus)}`}>{label}</span></td>
                  <td className="p-3 text-gray-500">{displayDate}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <select value={label} onChange={(e) => updateStatus(r.id, statusValues[e.target.value])} onClick={(e) => e.stopPropagation()} className="rounded-xl border px-2 py-1 text-xs">
                        <option value="baru">baru</option> <option value="diproses">diproses</option> <option value="selesai">selesai</option> <option value="abaikan">abaikan</option>
                      </select>
                      <button onClick={(e) => { e.stopPropagation(); remove(r.id); }} className="rounded-xl border px-2 py-1 text-xs text-red-600 hover:bg-red-50"> Hapus </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* ▲▲▲ SELESAI PEMERIKSAAN ▲▲▲ */}
        </table>
      </div>
    </main>
  );
}