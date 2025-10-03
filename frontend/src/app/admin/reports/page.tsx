'use client';

import React, { useEffect, useMemo, useState } from 'react';

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

type ReportItem = {
  id: string;
  judul?: string | null;
  perusahaan?: string | null;
  alasan?: string | null;
  catatan?: string | null;
  status: keyof typeof statusLabels | string;
  dibuatPada?: string | Date | null; // opsional
  createdAt?: string | Date | null;  // fallback
};

export default function AdminReportsPage() {
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

  // initial load
  useEffect(() => {
    load();
  }, []);

  // dengarkan event dari dialog & storage ping
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
  // Kirim ENUM ke backend
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

  /* ======================= RENDER ======================= */
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
              const enumStatus = String(r.status); // e.g. OPEN
              const label = statusLabels[enumStatus] || enumStatus; // e.g. baru
              const displayDate = fmtDate(r.dibuatPada ?? r.createdAt);

              return (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-3 font-medium">{r.judul || '—'}</td>
                  <td className="p-3">{r.perusahaan || '—'}</td>
                  <td className="p-3">{r.alasan || '—'}</td>
                  <td className="p-3 max-w-[24rem]">
                    <div className="line-clamp-3">{r.catatan || '—'}</div>
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${badgeClass(enumStatus)}`}>
                      {label}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500">{displayDate}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      {/* Dropdown tampil label, kirim ENUM */}
                      <select
                        value={label}
                        onChange={(e) => updateStatus(r.id, statusValues[e.target.value])}
                        className="rounded-xl border px-2 py-1"
                      >
                        <option value="baru">baru</option>
                        <option value="diproses">diproses</option>
                        <option value="selesai">selesai</option>
                        <option value="abaikan">abaikan</option>
                      </select>

                      <button
                        onClick={() => remove(r.id)}
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
