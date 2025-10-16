'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

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

type ReportItem = {
  id: string;
  judul?: string | null;
  perusahaan?: string | null;
  alasan?: string | null;
  catatan?: string | null;
  status: keyof typeof statusLabels | string;
  dibuatPada?: string | Date | null;
  createdAt?: string | Date | null;

  /** dikirim backend */
  targetUrl?: string | null;
  targetType?: TargetType | null;
  targetId?: string | number | null;
  targetSlug?: string | null;
};

export default function AdminReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  /* ======================= LOAD ======================= */
  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(api('/api/reports'), {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await res.json();
      const arr: ReportItem[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : [];
      setReports(arr);
    } catch (e) {
      console.error('[admin/reports] load() failed:', e);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    function onCreated(ev: any) {
      const item = ev?.detail as ReportItem | undefined;
      if (!item) return;
      setReports((prev) => (prev.some((p) => p.id === item.id) ? prev : [item, ...prev]));
    }
    function onStorage(ev: StorageEvent) {
      if (ev.key === 'ark:report:ping') load();
    }
    function onVisible() {
      if (document.visibilityState === 'visible') load();
    }
    window.addEventListener('ark:report-created', onCreated as any);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('ark:report-created', onCreated as any);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  /* ============== TARGET URL (deep-link ke baris list) ============== */
  const toFocusUrl = (base: string, id?: string | number | null) =>
    id ? `${base}?focus=${encodeURIComponent(String(id))}` : base;

  const getTargetHref = (r: ReportItem): string | null => {
    // 1) Jika backend sudah kasih URL — normalize ke ?focus= untuk employer-jobs
    if (r.targetUrl && typeof r.targetUrl === 'string') {
      // /admin/employer-jobs/123 -> /admin/employer-jobs?focus=123
      const m = r.targetUrl.match(/^(.*\/admin\/employer-jobs)\/([^/?#]+)/i);
      if (m) return toFocusUrl(m[1], m[2]);
      // kalau sudah berupa ?focus= atau path lain, pakai apa adanya
      return r.targetUrl;
    }

    // 2) Bangun dari tipe + id/slug
    const id = r.targetSlug || r.targetId;
    switch (r.targetType) {
      case 'JOB':
        return toFocusUrl('/admin/employer-jobs', id);
      case 'EMPLOYER':
      case 'COMPANY':
        return toFocusUrl('/admin/user-management/employers', id);
      case 'USER':
        return toFocusUrl('/admin/user-management/users', id);
      case 'TENDER':
        return toFocusUrl('/admin/tenders', id);
      default:
        return null;
    }
  };

  /* ======================= LIST (filter) ======================= */
  const filtered = useMemo(() => {
    const items = Array.isArray(reports) ? reports : [];
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((r) =>
      [r.judul, r.perusahaan, r.alasan, r.catatan, r.status]
        .filter(Boolean)
        .some((v: any) => String(v).toLowerCase().includes(q))
    );
  }, [reports, query]);

  /* ======================= ACTIONS ======================= */
  const updateStatus = async (id: string, enumStatus: string) => {
    try {
      await fetch(api(`/api/reports/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: enumStatus }),
        credentials: 'include',
      });
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: enumStatus } : r)));
    } catch (e) {
      console.error('updateStatus failed', e);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Hapus laporan ini?')) return;
    try {
      await fetch(api(`/api/reports/${id}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error('delete failed', e);
    }
  };

  /* ======================= UI HELPERS ======================= */
  const badgeClass = (statusEnum: string) =>
    statusEnum === 'OPEN'
      ? 'bg-amber-100 text-amber-700'
      : statusEnum === 'UNDER_REVIEW'
      ? 'bg-blue-100 text-blue-700'
      : statusEnum === 'ACTION_TAKEN'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-gray-100 text-gray-700';

  const fmtDate = (v?: string | Date | null) => {
    if (!v) return '—';
    try {
      const d = new Date(v);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString();
    } catch {
      return '—';
    }
  };

  /* ======================= RENDER ======================= */
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Admin · Laporan Masuk</h1>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari laporan…"
            className="w-full max-w-xs rounded-xl border px-3 py-2 focus:outline-none focus:ring"
          />
          <button onClick={load} className="rounded-xl border px-3 py-2 hover:bg-gray-50">
            {loading ? 'Muat…' : 'Muat ulang'}
          </button>
        </div>
      </div>

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
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-500">
                  Belum ada data
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const enumStatus = String(r.status);
              const label = statusLabels[enumStatus] || enumStatus;
              const displayDate = fmtDate(r.dibuatPada ?? r.createdAt);
              const targetHref = getTargetHref(r);

              const goToTarget = () => {
                if (targetHref) router.push(targetHref);
              };

              return (
                <tr
                  key={r.id}
                  className={`border-t align-top ${targetHref ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                  onClick={(e) => {
                    const tag = (e.target as HTMLElement).tagName;
                    if (['SELECT', 'BUTTON', 'OPTION', 'A', 'INPUT', 'TEXTAREA', 'SVG', 'PATH'].includes(tag)) return;
                    goToTarget();
                  }}
                >
                  <td className="p-3 font-medium">
                    {targetHref ? (
                      <a
                        href={targetHref}
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-600 hover:underline"
                      >
                        {r.judul || '—'}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        {r.judul || '—'}
                        <span
                          title="Target belum tersedia"
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
                        >
                          no target
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="p-3">{r.perusahaan || '—'}</td>
                  <td className="p-3">{r.alasan || '—'}</td>
                  <td className="p-3 max-w-[24rem]">
                    <div className="line-clamp-3">{r.catatan || '—'}</div>
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${badgeClass(enumStatus)}`}>{label}</span>
                  </td>
                  <td className="p-3 text-gray-500">{displayDate}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <select
                        value={label}
                        onChange={(e) => updateStatus(r.id, statusValues[e.target.value])}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-xl border px-2 py-1"
                      >
                        <option value="baru">baru</option>
                        <option value="diproses">diproses</option>
                        <option value="selesai">selesai</option>
                        <option value="abaikan">abaikan</option>
                      </select>

                      {targetHref && (
                        <a
                          href={targetHref}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-xl border px-2 py-1 hover:bg-gray-50"
                        >
                          Buka target
                        </a>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(r.id);
                        }}
                        className="rounded-xl border px-2 py-1 hover:bg-gray-50"
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
